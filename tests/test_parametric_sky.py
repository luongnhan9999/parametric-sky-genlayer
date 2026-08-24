import sys
import os
import unittest
from unittest.mock import MagicMock

class MockAddress(str): pass
class MockBigInt(int): pass
class MockUserError(Exception): pass

class MockReturn:
    def __init__(self, calldata):
        self.calldata = calldata

class MockContractStub:
    def __init__(self, address, tracker):
        self.address = address
        self.tracker = tracker

    def emit_transfer(self, value):
        self.tracker.append({"to": self.address, "value": value})

class MockGL:
    class Contract:
        def __init__(self):
            self.policies = {}
            self.policy_ids = []
            self.platform_admin = "0xadmin"

    class public:
        @staticmethod
        def view(fn): return fn
        @staticmethod
        def write(fn): return fn

    class message:
        value = MockBigInt(0)
        sender_address = MockAddress("0xUnderwriter")

    class nondet:
        class web:
            @staticmethod
            def render(url, mode="text"): pass
        @staticmethod
        def exec_prompt(prompt, response_format="json"): pass

    class vm:
        Return = MockReturn
        @staticmethod
        def run_nondet(leader_fn, validator_fn):
            res = leader_fn()
            ret = MockReturn(calldata=res)
            if not validator_fn(ret):
                raise MockUserError("Consensus Disagreement")
            return res

    def __init__(self):
        self.transfers = []
        self.message_raw = {"datetime": "2026-08-24T00:00:00+00:00"}

    def get_contract_at(self, address):
        return MockContractStub(address, self.transfers)

MockGL.public.write.payable = lambda fn: fn

mock_mod = MagicMock()
mock_mod.gl = MockGL()
mock_mod.allow_storage = lambda cls: cls
mock_mod.Address = MockAddress
mock_mod.bigint = MockBigInt
mock_mod.u256 = MockBigInt
mock_mod.UserError = MockUserError
mock_mod.TreeMap = dict
mock_mod.DynArray = list

sys.modules["genlayer"] = mock_mod
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "contracts")))
import ParametricSky as contract_module

class TestParametricSkyExecutionSuite(unittest.TestCase):
    def setUp(self):
        self.gl = mock_mod.gl
        self.gl.transfers = []
        self.gl.message_raw = {"datetime": "2026-08-24T00:00:00+00:00"}
        self.admin = MockAddress("0xadmin")
        self.underwriter = MockAddress("0xunderwriter_pool")
        self.farmer = MockAddress("0xfarmer_cooperative")

        self.gl.message.sender_address = self.admin
        self.contract = contract_module.Contract()
        self.contract.policies = {}
        self.contract.policy_ids = []
        self.contract.platform_admin = self.admin.lower()

        # Underwriter locks 5000 GEN coverage pool
        self.pid = "policy_thanh_hoa_rice_01"
        self.gl.message.sender_address = self.underwriter
        self.gl.message.value = MockBigInt(5000)
        self.contract.underwrite_policy(
            self.pid,
            self.farmer,
            "https://parametric.io/terms/drought_rice_2026.json",
            "19.8067 N, 105.7851 E",
            "NDVI < 0.25 for 14 consecutive days OR Cumulative rainfall < 15mm"
        )

    def test_01_severe_drought_full_payout(self):
        """Telemetry confirms severe drought -> Full 5000 GEN coverage paid to farmer after 24h."""
        self.gl.message.sender_address = self.farmer
        self.gl.nondet.web.render = lambda url, mode="text": "Satellite telemetry data: NDVI=0.18 for 18 days, rainfall=5mm"
        self.gl.nondet.exec_prompt = lambda p, response_format="json": {
            "verdict": "FULL_PAYOUT", "confidence": 98, "reason": "Severe vegetation collapse detected"
        }

        self.contract.trigger_claim_assessment(self.pid, "https://satellite-feed.copernicus.eu/telemetry_198067_1057851.json")
        self.assertEqual(self.contract.policies[self.pid].status, "AWAITING_PAYOUT")

        # Settlement after 24h window
        self.gl.message_raw = {"datetime": "2026-08-25T00:01:00+00:00"}
        self.contract.finalize_settlement(self.pid)
        self.assertEqual(self.contract.policies[self.pid].status, "CLOSED")
        self.assertEqual(self.gl.transfers[0]["to"], self.farmer)
        self.assertEqual(self.gl.transfers[0]["value"], 5000)

    def test_02_dispute_blocks_settlement_and_allows_arbitration(self):
        """Underwriter disputes parametric calculation -> blocks payout until admin arbitrates."""
        self.gl.message.sender_address = self.farmer
        self.gl.nondet.web.render = lambda url, mode="text": "Moderate drought"
        self.gl.nondet.exec_prompt = lambda p, response_format="json": {"verdict": "FULL_PAYOUT", "confidence": 90, "reason": "Drought"}
        self.contract.trigger_claim_assessment(self.pid, "https://satellite.org/data.json")

        # Underwriter disputes at T+10h
        self.gl.message_raw = {"datetime": "2026-08-24T10:00:00+00:00"}
        self.gl.message.sender_address = self.underwriter
        self.contract.raise_dispute(self.pid, "Irrigation canal feed offset was unmetered")
        self.assertEqual(self.contract.policies[self.pid].status, "DISPUTED")

        # Finalize settlement blocked
        self.gl.message_raw = {"datetime": "2026-08-25T02:00:00+00:00"}
        self.gl.message.sender_address = self.farmer
        with self.assertRaises(MockUserError):
            self.contract.finalize_settlement(self.pid)

        # Admin arbitrates 50/50 SPLIT
        self.gl.message.sender_address = self.admin
        self.contract.resolve_escalation(self.pid, "SPLIT")
        self.assertEqual(self.contract.policies[self.pid].status, "CLOSED")
        self.assertEqual(len(self.gl.transfers), 2)
        self.assertEqual(self.gl.transfers[0]["to"], self.farmer)
        self.assertEqual(self.gl.transfers[0]["value"], 2500)
        self.assertEqual(self.gl.transfers[1]["to"], self.underwriter)
        self.assertEqual(self.gl.transfers[1]["value"], 2500)

if __name__ == "__main__":
    unittest.main(verbosity=2)
