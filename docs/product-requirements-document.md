# Product Requirements Document

| Field | Value |
| --- | --- |
| Document ID | UAIL-ITDASH-PRD-001 |
| Version | 1.1 |
| Status | Active baseline |
| Classification | Internal |
| Owner | Tech-Unit IT |
| Last Updated | 2026-07-19 |
| Audience | Product owner, operations, infrastructure, delivery |

## 1. Purpose
Define the product vision, scope, requirements, and acceptance criteria for the UAIL IT Dashboard as it exists today and as it should be sustained going forward.

## 2. Product Vision
Deliver a reliable engineering wallboard for UAIL IT operations that shows trustworthy live status from critical operational systems on a single screen, while giving administrators a practical web-based control surface for service recovery, source configuration, and documentation access.

## 3. Problem Statement
Operations visibility was previously split across multiple portals:
- Nutanix for HCI and VM telemetry
- SolarWinds for network and on-prem infrastructure telemetry
- Symphony HSD for service desk backlog and SLA posture

This made it slow to understand current operational state, difficult to spot stale or failed source feeds, and inefficient to recover collector issues.

## 4. Product Goals
- Present live, trustworthy operational telemetry on one wallboard.
- Make source freshness explicit for every major dashboard area.
- Prevent fabricated data from appearing during normal runtime.
- Provide a compact admin console for service control and source/session maintenance.
- Support Windows server deployment without requiring internet-dependent runtime setup.

## 5. Non-Goals
- Replace upstream systems as systems of record.
- Act as a ticketing or infrastructure management platform.
- Provide enterprise SSO in the current baseline.
- Provide unrestricted historical reporting or BI analytics.

## 6. Primary Users

| User Group | Needs |
| --- | --- |
| Operations viewers | Fast wallboard visibility and confidence in live state |
| IT leads | Consolidated health, backlog, and exception posture |
| Administrators | Practical control of services, sessions, and source configuration |
| Review stakeholders | Clear documentation of scope, design, and operating model |

## 7. Functional Scope

### 7.1 Operator Surface
The operator surface shall:
- be available on `21060`
- render a one-page engineering dashboard optimized for `1920x1200`
- provide a usable fallback layout for `1920x1080`, tablet, and mobile
- expose filters to show and hide relevant sections and data categories
- show data-link state and last synced time for major cards

### 7.2 HCI Metrics
The dashboard shall:
- show Nutanix HCI metrics for cluster CPU, memory, and storage
- show node state and node-level quick status
- use threshold color language for metric bars and status indicators

### 7.3 HSD Metrics
The dashboard shall:
- show open incidents, service requests, work orders, and changes
- show status breakdowns for `new`, `assigned`, `in progress`, and `pending`
- show SLA posture and about-to-miss indicators
- show special queues including P1, P2, onboarding, and security

### 7.4 Network Metrics
The dashboard shall:
- show SolarWinds 46 network telemetry
- show carrier and SDWAN path state
- show Tx and Rx utilization clearly
- show sparkline trend information for monitored links

### 7.5 Server Metrics
The dashboard shall:
- show server telemetry grouped by platform and operating system
- distinguish HCI VM from on-prem
- distinguish Windows from Linux
- show normal, warning, critical, and offline states
- show source attribution where required

### 7.6 Admin Surface
The admin surface shall:
- be available on `21061`
- expose service state and restart controls
- expose source configuration for Nutanix, SolarWinds 45, SolarWinds 46, and HSD
- expose session validation and reauthentication flows for HSD and SolarWinds
- expose documentation PDFs in a Help section

## 8. Source Of Truth Rules
- Nutanix is the source of truth for HCI-backed servers.
- SolarWinds is the source of truth for network telemetry.
- SolarWinds is the source of truth for on-prem server telemetry.
- For overlapping server coverage, Nutanix remains primary unless it is stale for more than 10 minutes and SolarWinds telemetry is available.
- On source failure, the dashboard shall continue to display the last successful values with the corresponding last sync time.
- The product shall not fabricate fallback values during normal operation.

## 9. Reliability Requirements
- Services shall be restartable independently and as a full stack.
- The system shall expose card-level freshness and failure information.
- Session-dependent sources shall fail visibly when their session state is expired or invalid.
- The deployed stack shall support PM2-based auto-restart and startup restoration.

## 10. Security Requirements
- Only `21060` and `21061` should be LAN-exposed.
- Internal application services shall remain loopback-only.
- Source credentials shall be configurable through the admin surface and stored in the supported local encrypted settings model when available.
- Bootstrap and deployment flows shall not assume shared credentials between SolarWinds 45, SolarWinds 46, and HSD.
- Runtime session files shall be treated as sensitive operational credentials.
- Admin actions shall require the admin login surface.

## 11. User Experience Requirements
- The operator wallboard must be readable from distance.
- Visual emphasis should prefer large, meaningful metrics over dense text.
- Error or stale-state messaging must be short and local to the relevant section.
- The admin console must remain practical and low-friction for service recovery and configuration tasks.

## 12. Constraints
- Nutanix uses non-ideal internal TLS certificates.
- SolarWinds and Symphony HSD still depend on browser session state.
- Windows deployment simplicity remains a priority.
- SQLite is the current primary runtime store.

## 13. Acceptance Criteria

| ID | Acceptance Criteria |
| --- | --- |
| AC-01 | Operator login works on `21060` and admin login works on `21061`. |
| AC-02 | All enabled cards show real values or last synced values with visible freshness status. |
| AC-03 | HCI metrics come from Nutanix and revert back to Nutanix after fallback conditions clear. |
| AC-04 | Network telemetry comes from SolarWinds 46 and displays carrier/path state clearly. |
| AC-05 | HSD metrics reflect portal-mapped status buckets and special queues. |
| AC-06 | Admin users can inspect services, validate sessions, update sources, and open help PDFs. |
| AC-07 | The wallboard remains usable on the primary `1920x1200` display target. |
| AC-08 | Deployment bootstrap prompts independently for SolarWinds 45, SolarWinds 46, and HSD credentials. |

## 14. Future Considerations
- Enterprise authentication integration
- Stronger application-layer authentication for collector updates
- API-first HSD collection if upstream capability becomes available
- Deeper historical reporting once data retention requirements are defined
