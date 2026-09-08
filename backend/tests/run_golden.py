"""Golden test runner. No pytest dependency so it runs anywhere Python does."""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from ai.extraction.fields import TextBlock, extract_all
from rules.engine import RuleRepository, evaluate

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
FIXTURES = os.path.join(ROOT, "dataset", "test_cases", "fixtures.json")
RULES = os.path.join(ROOT, "rules", "lmpc_rules.json")

def main():
    cases = json.load(open(FIXTURES))["cases"]
    repo = RuleRepository.from_file(RULES)
    passed = failed = 0
    for case in cases:
        blocks = [TextBlock(**{k: v for k, v in b.items()}) for b in case["blocks"]]
        fields = extract_all(blocks)
        ctx = dict(case.get("context", {}))
        ctx["all_price_candidates"] = []
        from ai.pipeline import _price_candidates
        ctx["all_price_candidates"] = _price_candidates(blocks)
        result = evaluate(repo, fields, ctx)
        ok = result["status"] == case["expected_status"]
        codes = {v["rule_code"] for v in result["violations"]}
        expected_codes = set(case.get("expected_violations", []))
        codes_ok = expected_codes.issubset(codes) if expected_codes else True
        mark = "PASS" if (ok and codes_ok) else "FAIL"
        if ok and codes_ok: passed += 1
        else: failed += 1
        print(f"[{mark}] {case['id']:34s} got={result['status']:16s} want={case['expected_status']:16s} violations={sorted(codes)}")
        if not (ok and codes_ok) and expected_codes:
            print(f"        expected violations {sorted(expected_codes)}")
    print(f"\n{passed} passed, {failed} failed")
    return 1 if failed else 0

if __name__ == "__main__":
    sys.exit(main())
