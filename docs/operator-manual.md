# Operator User Manual

| Field | Value |
| --- | --- |
| Document ID | UAIL-ITDASH-OPS-001 |
| Version | 1.0 |
| Status | Internal review |
| Classification | Internal |
| Owner | Tech-Unit IT |
| Last Updated | 2026-07-17 |
| Audience | Operators and wallboard viewers |

## 1. Audience
This guide is for operations users who monitor the wallboard and use dashboard filters but do not manage services or credentials.

## 2. Login
Browse to the operator surface:
- `http://<server>:21060/login`

Use the operator password on the operator login page.

![Operator login](assets/screenshots/operator-login.png)

## 3. What You See
The operator wallboard is organized into:
- HCI cluster metrics
- Hindalco Service Desk metrics
- Network fabric metrics
- Server fleet metrics

![Operator dashboard](assets/screenshots/operator-dashboard.png)

## 4. Reading Data-Link Status
Every major card includes a compact data-link status area. Use it as follows:
- `OK`: source is updating normally
- `STALE`: last success is older than expected
- `ERROR`: collector attempted a refresh but failed
- `NEVER`: no successful sync yet

Important:
- the card continues to show the last successfully synced data when the source fails
- the timestamp indicates when the displayed values were last confirmed

## 5. Color Language
- Green: normal/healthy
- Amber: warning
- Orange: elevated concern
- Red: critical or about to miss
- Grey/slate: offline or unavailable

## 6. Filters
Use the filter bar to show or hide:
- sections: HCI, HSD, Network, Servers
- server status: normal, warning, critical, offline
- server platform: HCI VM, On Prem
- server OS: Windows, Linux
- server source: Nutanix, SW45, Fallback
- network carrier: Jio, RailTel, Other
- network path: ISP, SDWAN
- network state: Up, Warning, Down
- HSD work type: Incidents, Service Requests, Work Orders, Changes
- HSD special queues: P1, P2, Onboard, Security

## 7. How To Interpret Each Section

### 7.1 HCI
- Shows live cluster metrics from Nutanix
- Node chips show node state
- Utilization bars show quick threshold posture

### 7.2 HSD
- Big numbers represent current open workload totals
- Vertical breakdown charts show the status mix
- SLA widgets summarize current compliance posture
- P1, P2, onboarding, and security counts identify queue pressure

### 7.3 Network
- Link pills summarize carrier and SDWAN state
- Sparklines show real-time utilization trend
- Tx and Rx values show current bandwidth directionally

### 7.4 Servers
- Servers are organized by platform and OS family
- Color-coded bars summarize resource or health posture
- Fallback state indicates a Nutanix-backed server is temporarily shown from SolarWinds because Nutanix is stale

## 8. Mobile And Portrait View
On narrow screens the dashboard switches to a responsive stacked layout. This is intended for monitoring and quick inspection, not for replacing the main wallboard.

## 9. What Operators Should Do When Something Looks Wrong
- Check the card-level data-link status first
- If the card is stale or erroring, treat the values as last-synced, not current
- If the card is healthy but the metric is abnormal, treat it as a live condition
- Escalate session or service issues to an admin user

## 10. Logout
Use the logout control in the header when the operator session should end.
