# Service Model - 2026-07-15

## Phase 1
- process manager: PM2
- admin web surface interacts with local PM2 commands through the dashboard app
- lowest disruption to the current stack

## Phase 2
- process manager: Windows-native wrappers
- preferred target: WinSW
- PM2 can then be retired if operationally useful

## Required Admin Actions
- start one service
- stop one service
- restart one service
- restart entire stack
- show current status
- show recent logs

## Required Health Inputs
- process up/down from PM2 or service wrapper
- live HTTP health for `api-gateway`, `dashboard-ui`, `dashboard-frontdoor-operator`, and `dashboard-frontdoor-admin`
- logical collector health from dashboard state / collector metadata
- stale/error/never classifications

## Session-Aware Services
- `symphony-collector`
- `solarwinds-collector`

## Future Local API Contract
- `services:list`
- `services:start`
- `services:stop`
- `services:restart`
- `services:restartAll`
- `health:collect`
- `sessions:import`
- `sessions:status`
- `config:load`
- `config:save`
- `logs:tail`

## Security Rules
- service-control commands must remain local-admin only
- no anonymous browser access
- no service-control actions in the viewer dashboard
- session imports must be limited to admin role
