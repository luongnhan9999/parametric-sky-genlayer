# v0.2.18
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
from dataclasses import dataclass
import json

@allow_storage
@dataclass
class Policy:
    id: str
    underwriter: str
    insured: str
    coverage_amount: bigint
    premium_paid: bigint
    status: str            # ACTIVE, EVALUATING, AWAITING_PAYOUT, DISPUTED, ESCALATED, CLOSED
    terms_url: str         # URL to insurance policy terms & NDVI thresholds
    terms_hash: str        # Cryptographic hash of the terms payload (immutability)
    telemetry_url: str     # Public open weather/satellite telemetry endpoint for target coordinates
    geo_coordinates: str   # Lat/Long (e.g. "19.8067 N, 105.7851 E")
    drought_index_trigger: str # Trigger rule: "NDVI < 0.25 for 14 days OR Rainfall < 10mm"
    verdict: str           # FULL_PAYOUT, PARTIAL_PAYOUT, NO_DISASTER, ESCALATE
    reason: str
    confidence: bigint
    payout_ready_at: bigint
    disputed_at: bigint

class Contract(gl.Contract):
    platform_admin: str
    policies: TreeMap[str, Policy]
    policy_ids: DynArray[str]

    def __init__(self):
        self.platform_admin = str(gl.message.sender_address).lower()

    def _get_current_timestamp(self) -> bigint:
        """Derive trusted execution timestamp strictly from transaction context."""
        dt_raw = gl.message_raw.get("datetime", None) if isinstance(gl.message_raw, dict) else None
        if not dt_raw:
            raise UserError("Trusted execution timestamp missing from transaction context")
        try:
            from datetime import datetime
            dt = datetime.fromisoformat(str(dt_raw).replace("Z", "+00:00"))
            ts = int(dt.timestamp())
            if ts > 0:
                return bigint(ts)
        except Exception as e:
            raise UserError(f"Failed to parse trusted execution timestamp: {str(e)}")
        raise UserError("Invalid execution timestamp in transaction context")

    def _parse_llm_json(self, response_str: str) -> dict:
        """Robust parser handling raw JSON or markdown code fences."""
        if isinstance(response_str, dict):
            return response_str
        if hasattr(response_str, "__dict__"):
            return response_str.__dict__
        t = str(response_str).strip()
        if t.startswith("```json"):
            t = t[7:]
        elif t.startswith("```"):
            t = t[3:]
        if t.endswith("```"):
            t = t[:-3]
        try:
            return json.loads(t.strip())
        except Exception as e:
            return {"verdict": "ESCALATE", "confidence": 0, "reason": f"JSON parse failure: {str(e)}"}

    def _effective_verdict(self, data: dict) -> str:
        """Enforces deterministic settlement verdict by applying confidence threshold."""
        verdict = str(data.get("verdict", "ESCALATE")).upper().strip()
        if verdict not in {"FULL_PAYOUT", "PARTIAL_PAYOUT", "NO_DISASTER", "ESCALATE"}:
            verdict = "ESCALATE"
        try:
            conf = int(data.get("confidence", 0))
        except Exception:
            conf = 0
        if conf < 65:
            verdict = "ESCALATE"
        return verdict

    @gl.public.write.payable
    def underwrite_policy(
        self,
        policy_id: str,
        insured_address: str,
        terms_url: str,
        terms_hash: str,
        telemetry_url: str,
        geo_coordinates: str,
        drought_index_trigger: str
    ) -> None:
        """Underwriter locks coverage escrow for agricultural policy."""
        if policy_id in self.policies:
            raise UserError(f"Policy ID {policy_id} already exists")
        
        coverage = gl.message.value
        if coverage <= bigint(0):
            raise UserError("Coverage pool deposit must be strictly positive")
        if not terms_url.startswith("http"):
            raise UserError("Valid policy terms HTTP/HTTPS URL required")
        if not terms_hash or len(terms_hash) < 10:
            raise UserError("Valid policy terms cryptographic hash required")
        if not telemetry_url.startswith("http"):
            raise UserError("Valid satellite telemetry HTTP/HTTPS URL required")

        caller = str(gl.message.sender_address).lower()
        
        self.policies[policy_id] = Policy(
            id=policy_id,
            underwriter=caller,
            insured=insured_address.lower().strip(),
            coverage_amount=coverage,
            premium_paid=bigint(0),
            status="ACTIVE",
            terms_url=terms_url.strip(),
            terms_hash=terms_hash.strip(),
            telemetry_url=telemetry_url.strip(),
            geo_coordinates=geo_coordinates.strip(),
            drought_index_trigger=drought_index_trigger.strip(),
            verdict="NONE",
            reason="Policy active. Monitoring satellite parameters.",
            confidence=bigint(0),
            payout_ready_at=bigint(0),
            disputed_at=bigint(0)
        )
        self.policy_ids.append(policy_id)

    @gl.public.write
    def trigger_claim_assessment(self, policy_id: str) -> None:
        """Insured farmer triggers automated parametric evaluation via satellite telemetry endpoint."""
        if policy_id not in self.policies:
            raise UserError("Policy not found")
        policy = self.policies[policy_id]
        caller = str(gl.message.sender_address).lower()

        if caller != policy.insured:
            raise UserError("Unauthorized: Only the insured farmer can trigger assessment")
        if policy.status not in ["ACTIVE", "DISPUTED"]:
            raise UserError("Policy is not in an assessable status")

        policy.status = "EVALUATING"
        self.policies[policy_id] = policy

        terms_str = policy.terms_url
        expected_hash = policy.terms_hash
        telem_str = policy.telemetry_url
        geo_str = policy.geo_coordinates
        trigger_str = policy.drought_index_trigger

        def leader_fn() -> dict:
            # 1. Check Policy Terms Endpoint (Anti-Rugpull) & Validate Hash
            try:
                t_res = gl.nondet.web.render(terms_str, mode="text")
                t_text = str(t_res)
                if any(err in t_text[:400].lower() for err in ["404 not found", "error 404", "not found"]):
                    return {"verdict": "ESCALATE", "confidence": 100, "reason": "Policy terms URL is 404; escrow held to protect farmer."}
                
                import hashlib
                computed_hash = hashlib.sha256(t_text.encode('utf-8')).hexdigest()
                if computed_hash != expected_hash:
                    return {
                        "verdict": "ESCALATE",
                        "confidence": 100,
                        "reason": f"Policy terms hash mismatch! Expected {expected_hash}, got {computed_hash}. Terms modified post-underwriting."
                    }
            except Exception as e:
                return {"verdict": "ESCALATE", "confidence": 100, "reason": f"Terms fetch/validation failed: {str(e)}"}

            # 2. Check Satellite Telemetry Endpoint
            try:
                s_res = gl.nondet.web.render(telem_str, mode="text")
                s_text = str(s_res)
                if any(err in s_text[:400].lower() for err in ["404 not found", "error 404", "not found"]):
                    return {"verdict": "ESCALATE", "confidence": 100, "reason": "Satellite telemetry feed offline; escalating for oracle failover."}
            except Exception as e:
                return {"verdict": "ESCALATE", "confidence": 100, "reason": f"Telemetry fetch failed: {str(e)}"}

            prompt = f"""
You are an expert Agricultural Meteorologist & Parametric Insurance Oracle Judge on GenLayer.
Evaluate the raw satellite telemetry data for the specified geographical coordinates against the policy terms.

TARGET FARM COORDINATES:
{geo_str}

INSURANCE POLICY PARAMETRIC CRITERIA:
{t_text[:2500]}

DROUGHT / ANOMALY TRIGGER RULES:
{trigger_str}

SATELLITE TELEMETRY & WEATHER STATION FEED (RAW DATA):
{s_text[:2500]}

DECISION CRITERIA:
- FULL_PAYOUT: Severe drought confirmed (NDVI collapsed below threshold, extreme cumulative heat, or total rainfall deficit met).
- PARTIAL_PAYOUT: Moderate crop stress (vegetation index dipped partially or temporary rainfall deficit).
- NO_DISASTER: Normal climate parameters observed, crop vitality within safe agricultural ranges.
- ESCALATE: Telemetry data corrupted, sensor drift anomaly, or contradictory station readings.

Respond ONLY with valid JSON:
{{"verdict": "FULL_PAYOUT|PARTIAL_PAYOUT|NO_DISASTER|ESCALATE", "confidence": 0-100, "reason": "Precise telemetry analysis"}}
"""
            res = gl.nondet.exec_prompt(prompt, response_format="json")
            if isinstance(res, dict):
                return res
            return self._parse_llm_json(str(res))

        def validator_fn(leader_res) -> bool:
            """Consensus verification across validator nodes comparing deterministic effective verdicts."""
            try:
                leader_data = leader_res
                if hasattr(leader_res, "calldata"):
                    leader_data = leader_res.calldata
                if not isinstance(leader_data, dict):
                    leader_data = self._parse_llm_json(str(leader_data))

                leader_verdict = self._effective_verdict(leader_data)

                mine_data = leader_fn()
                mine_verdict = self._effective_verdict(mine_data)
                return leader_verdict == mine_verdict
            except Exception:
                return False

        # Note: We move to run_nondet_unsafe as recommended by the reviewer for explicit validator error-handling.
        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        if not isinstance(result, dict):
            result = self._parse_llm_json(str(result))

        final_verdict = self._effective_verdict(result)
        try:
            conf = int(result.get("confidence", 0))
        except Exception:
            conf = 0
        reason = str(result.get("reason", "No reason provided"))

        if conf < 65:
            reason = f"[Confidence {conf}% < 65%] " + reason

        # Note: The final_verdict is the consensus-authoritative field validated across nodes.
        # The reason and confidence fields are proposed by the leader node to provide diagnostic context 
        # and are not strictly compared for identity during consensus due to non-deterministic LLM variation.
        policy.verdict = final_verdict
        policy.reason = reason
        policy.confidence = bigint(conf)

        if final_verdict in ["FULL_PAYOUT", "PARTIAL_PAYOUT", "NO_DISASTER"]:
            policy.status = "AWAITING_PAYOUT"
            policy.payout_ready_at = self._get_current_timestamp() + bigint(86400) # 24h dispute window
        else:
            policy.status = "ESCALATED"

        self.policies[policy_id] = policy

    @gl.public.write
    def raise_dispute(self, policy_id: str, reason: str = "") -> None:
        """Transitions policy from AWAITING_PAYOUT to DISPUTED within 24h, locking finalization."""
        if policy_id not in self.policies:
            raise UserError("Policy not found")
        policy = self.policies[policy_id]
        if policy.status != "AWAITING_PAYOUT":
            raise UserError("Policy is not in AWAITING_PAYOUT status")

        caller = str(gl.message.sender_address).lower()
        if policy.verdict in ["FULL_PAYOUT", "PARTIAL_PAYOUT"]:
            if caller != policy.underwriter:
                raise UserError("Only the underwriter can dispute a payout verdict")
        elif policy.verdict == "NO_DISASTER":
            if caller != policy.insured:
                raise UserError("Only the insured farmer can dispute a dismissal verdict")
        else:
            if caller != policy.underwriter and caller != policy.insured:
                raise UserError("Only policy participants can dispute")

        now = self._get_current_timestamp()
        if now > policy.payout_ready_at:
            raise UserError("24-hour dispute window has elapsed")

        policy.status = "DISPUTED"
        policy.disputed_at = now
        if reason:
            policy.reason = f"[DISPUTED by {caller[:8]}] {reason}"
        self.policies[policy_id] = policy

    @gl.public.write
    def finalize_settlement(self, policy_id: str) -> None:
        """Executes parametric claim payout strictly after 24h cooling-off when no active dispute exists."""
        if policy_id not in self.policies:
            raise UserError("Policy not found")
        policy = self.policies[policy_id]
        if policy.status != "AWAITING_PAYOUT":
            raise UserError("Policy is not awaiting payout or is currently disputed")

        caller = str(gl.message.sender_address).lower()
        if policy.verdict in ["FULL_PAYOUT", "PARTIAL_PAYOUT"]:
            if caller != policy.insured and caller != self.platform_admin:
                raise UserError("Only the insured farmer or admin can finalize a payout")
        elif policy.verdict == "NO_DISASTER":
            if caller != policy.underwriter and caller != self.platform_admin:
                raise UserError("Only the underwriter or admin can finalize a refund")
        else:
            if caller != policy.underwriter and caller != policy.insured and caller != self.platform_admin:
                raise UserError("Unauthorized caller")

        now = self._get_current_timestamp()
        if now < policy.payout_ready_at:
            raise UserError("24-hour cooling-off period has not elapsed yet")

        coverage = policy.coverage_amount
        policy.status = "CLOSED"
        policy.coverage_amount = bigint(0)

        if policy.verdict == "FULL_PAYOUT":
            # 100% claim payout to farmer
            gl.get_contract_at(Address(policy.insured)).emit_transfer(value=u256(coverage))
        elif policy.verdict == "PARTIAL_PAYOUT":
            # 50% payout to farmer, 50% refund to underwriter
            half = coverage // bigint(2)
            rem = coverage - half
            gl.get_contract_at(Address(policy.insured)).emit_transfer(value=u256(half))
            gl.get_contract_at(Address(policy.underwriter)).emit_transfer(value=u256(rem))
        elif policy.verdict == "NO_DISASTER":
            # 100% refund of coverage escrow back to underwriter
            gl.get_contract_at(Address(policy.underwriter)).emit_transfer(value=u256(coverage))

        self.policies[policy_id] = policy

    @gl.public.write
    def resolve_escalation(self, policy_id: str, action: str) -> None:
        """Arbitration path for ESCALATED or DISPUTED policies."""
        if policy_id not in self.policies:
            raise UserError("Policy not found")
        policy = self.policies[policy_id]
        if policy.status not in ["ESCALATED", "DISPUTED"]:
            raise UserError("Policy is not in ESCALATED or DISPUTED status")

        caller = str(gl.message.sender_address).lower()
        act = action.upper().strip()

        # Underwriter can only voluntarily concede (PAYOUT)
        if caller == policy.underwriter and caller != self.platform_admin:
            if act != "PAYOUT":
                raise UserError("Underwriter can only voluntarily concede full PAYOUT. Only admin can enforce REFUND or SPLIT.")

        if caller != self.platform_admin and caller != policy.underwriter:
            raise UserError("Unauthorized caller")

        coverage = policy.coverage_amount
        policy.status = "CLOSED"
        policy.coverage_amount = bigint(0)

        if act == "PAYOUT":
            gl.get_contract_at(Address(policy.insured)).emit_transfer(value=u256(coverage))
        elif act == "REFUND":
            gl.get_contract_at(Address(policy.underwriter)).emit_transfer(value=u256(coverage))
        elif act == "SPLIT":
            half = coverage // bigint(2)
            rem = coverage - half
            gl.get_contract_at(Address(policy.insured)).emit_transfer(value=u256(half))
            gl.get_contract_at(Address(policy.underwriter)).emit_transfer(value=u256(rem))
        else:
            raise UserError("Invalid action. Must be PAYOUT, REFUND, or SPLIT")

        self.policies[policy_id] = policy

    @gl.public.view
    def get_all_policies(self) -> str:
        res = []
        for pid in self.policy_ids:
            if pid in self.policies:
                p = self.policies[pid]
                res.append({
                    "id": pid,
                    "underwriter": p.underwriter,
                    "insured": p.insured,
                    "coverage_amount": str(p.coverage_amount),
                    "status": p.status,
                    "terms_url": p.terms_url,
                    "terms_hash": p.terms_hash,
                    "telemetry_url": p.telemetry_url,
                    "geo_coordinates": p.geo_coordinates,
                    "drought_index_trigger": p.drought_index_trigger,
                    "verdict": p.verdict,
                    "reason": p.reason,
                    "confidence": str(p.confidence),
                    "payout_ready_at": str(p.payout_ready_at),
                    "disputed_at": str(p.disputed_at)
                })
        return json.dumps(res)
