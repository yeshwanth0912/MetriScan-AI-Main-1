from types import SimpleNamespace

from rules.engine import RuleRepository


def test_repository_can_be_built_from_persisted_rule_rows():
    version = SimpleNamespace(
        id="rv-1", version=1, effective_from="2020-01-01", effective_to=None,
        definition={"confidence_floor": 0.7}, source_reference="G.S.R. TEST",
        verification_status="VERIFIED", active=True,
    )
    row = SimpleNamespace(
        id="r-1", code="LM-TEST", title="Test rule", description="desc",
        category="declaration", requirement_type="presence", severity="MAJOR",
        field="commodity_name", applicability={}, active=True, versions=[version],
    )
    repo = RuleRepository.from_db_rows([row])
    assert len(repo.rules) == 1
    assert repo.rules[0].code == "LM-TEST"
    assert repo.rules[0].version_for(__import__('datetime').date(2026, 1, 1)).verification_status == "VERIFIED"
