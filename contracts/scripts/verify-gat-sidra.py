#!/usr/bin/env python3
"""Verify GATToken on ledger.sidrachain.com using matching standard-json input."""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ADDR = "0x604cB63465B8785eE3aD0cFc506125D28be42d07"
ARGS = (
    "000000000000000000000000584486030467e4f468d7edd4881f1404d8707507"
    + format(10_000_000 * 10**18, "064x")
    + format(100_000_000 * 10**18, "064x")
)
COMPILER = "v0.8.24+commit.e11b9ed9"
CLEAN = ROOT / "artifacts" / "GATToken.standard-input.CLEAN2.json"
MATCHING = ROOT / "artifacts" / "GATToken.standard-input.MATCHING.json"
INPUT_PATH = CLEAN if CLEAN.exists() else MATCHING


def http_json(url: str, data: bytes | None = None, headers: dict | None = None):
    req = urllib.request.Request(
        url,
        data=data,
        headers={"User-Agent": "Mozilla/5.0", **(headers or {})},
        method="POST" if data is not None else "GET",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        return resp.status, json.loads(resp.read().decode())


def check_verified() -> dict:
    _, j = http_json(f"https://ledger.sidrachain.com/api/v2/smart-contracts/{ADDR}")
    return j


def submit_classic(inp: dict, contract_name: str) -> str:
    fields = {
        "module": "contract",
        "action": "verifysourcecode",
        "contractaddress": ADDR,
        "sourceCode": json.dumps(inp),
        "codeformat": "solidity-standard-json-input",
        "contractname": contract_name,
        "compilerversion": COMPILER,
        "optimizationUsed": "1",
        "runs": "200",
        "constructorArguements": ARGS,
        "evmversion": "paris",
        "licenseType": "3",
    }
    data = urllib.parse.urlencode(fields).encode()
    _, body = http_json(
        "https://ledger.sidrachain.com/api",
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    print("classic submit:", body)
    return str(body.get("result", ""))


def poll_guid(guid: str, attempts: int = 24) -> str:
    last = ""
    for i in range(attempts):
        time.sleep(5)
        q = urllib.parse.urlencode(
            {"module": "contract", "action": "checkverifystatus", "guid": guid}
        )
        _, st = http_json(f"https://ledger.sidrachain.com/api?{q}")
        last = str(st.get("result", ""))
        print(f"guid poll {i}: {last}")
        if "Pending" in last or "queue" in last.lower() or "being" in last.lower():
            continue
        return last
    return last


def submit_v2_standard(path: Path, contract_name: str) -> None:
    cmd = [
        "curl",
        "-sS",
        "-A",
        "Mozilla/5.0",
        "-X",
        "POST",
        f"https://ledger.sidrachain.com/api/v2/smart-contracts/{ADDR}/verification/via/standard-input",
        "-F",
        f"compiler_version={COMPILER}",
        "-F",
        "license_type=mit",
        "-F",
        f"contract_name={contract_name}",
        "-F",
        f"constructor_args={ARGS}",
        "-F",
        f"files[standard-input.json]=@{path};type=application/json",
    ]
    out = subprocess.check_output(cmd, text=True)
    print("v2 standard-input:", out)


def submit_v2_multipart(inp: dict) -> None:
    tmp = Path("/tmp/gat-mp-final")
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir()
    cmd = [
        "curl",
        "-sS",
        "-A",
        "Mozilla/5.0",
        "-X",
        "POST",
        f"https://ledger.sidrachain.com/api/v2/smart-contracts/{ADDR}/verification/via/multi-part",
        "-F",
        f"compiler_version={COMPILER}",
        "-F",
        "license_type=mit",
        "-F",
        "contract_name=GATToken",
        "-F",
        "optimization_runs=200",
        "-F",
        "is_optimization_enabled=true",
        "-F",
        "evm_version=paris",
        "-F",
        f"constructor_args={ARGS}",
    ]
    for rel, obj in inp["sources"].items():
        p = tmp / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(obj["content"])
        cmd += ["-F", f"files[]=@{p};filename={rel}"]
    out = subprocess.check_output(cmd, text=True)
    print("v2 multi-part:", out)


def ethdb_verify(inp: dict, deployed: str) -> None:
    body = {
        "bytecode": deployed,
        "bytecodeType": "DEPLOYED_BYTECODE",
        "compilerVersion": COMPILER,
        "input": json.dumps(inp),
        "metadata": {"chainId": "97453", "contractAddress": ADDR},
    }
    _, j = http_json(
        "https://eth-bytecode-db.services.blockscout.com/api/v2/verifier/solidity/sources:verify-standard-json",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    print("eth-bytecode-db:", j.get("status"), j.get("message"))


def main() -> int:
    if not INPUT_PATH.exists():
        print("missing input", INPUT_PATH)
        return 1
    inp = json.load(open(INPUT_PATH))
    print("using", INPUT_PATH, "sources", len(inp.get("sources", {})))

    _, sc = http_json(f"https://ledger.sidrachain.com/api/v2/smart-contracts/{ADDR}")
    if sc.get("is_verified"):
        print("ALREADY VERIFIED", sc.get("name"), sc.get("compiler_version"))
        return 0

    ethdb_verify(inp, sc["deployed_bytecode"])
    submit_v2_standard(INPUT_PATH, "src/GATToken.sol:GATToken")
    try:
        submit_v2_multipart(inp)
    except Exception as e:
        print("multipart error:", e)

    for cname in ("src/GATToken.sol:GATToken", "GATToken", "_gat_only_src/GATToken.sol:GATToken"):
        try:
            guid = submit_classic(inp, cname)
            if guid and not guid.startswith("Fail"):
                result = poll_guid(guid, attempts=8)
                if "Pass" in result or "Already" in result:
                    break
        except Exception as e:
            print("classic error", cname, e)

    print("waiting for explorer to mark verified...")
    for i in range(36):
        time.sleep(5)
        j = check_verified()
        print(f"status {i}: verified={j.get('is_verified')} name={j.get('name')}")
        if j.get("is_verified"):
            print("SUCCESS")
            print(
                {
                    "name": j.get("name"),
                    "compiler": j.get("compiler_version"),
                    "optimizer": j.get("optimization_enabled"),
                    "runs": j.get("optimization_runs"),
                    "evm": j.get("evm_version"),
                    "license": j.get("license_type"),
                }
            )
            return 0

    print("NOT VERIFIED, Sidra verifier still broken (empty compiler list)")
    return 2


if __name__ == "__main__":
    sys.exit(main())
