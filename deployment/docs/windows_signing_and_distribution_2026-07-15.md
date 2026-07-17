# Windows Signing And Distribution Guidance - 2026-07-15

## Objective
- define how the installer and web deployment package should be distributed in development, internal testing, and production
- clarify what happens with unsigned Windows binaries
- define acceptable interim controls if code signing is not yet available

## Short Answer
- unsigned Windows executables may still run
- they commonly trigger SmartScreen warnings
- in corporate environments they may be blocked entirely by security policy

## Expected Windows Behavior

### Unmanaged / lightly managed machines
- Windows may show:
- `Windows protected your PC`
- user can usually choose `More info` then `Run anyway`
- this is a warning path, not always a hard block

### Corporate-managed endpoints or servers
- execution may be blocked by:
- Microsoft Defender SmartScreen policy
- AppLocker
- Windows Defender Application Control (WDAC)
- Defender for Endpoint / EDR controls
- Group Policy restrictions

## Recommended Policy By Stage

### 1. Development
- unsigned executable is acceptable
- use only on developer/admin systems
- do not distribute broadly

### 2. Internal testing
- unsigned executable is acceptable only if:
- it is used on a controlled internal server or approved admin workstation
- the file origin is known
- security/network teams are aware of the pilot
- local path or file hash is allowlisted if needed

### 3. Production
- signed executable and signed installer are strongly recommended
- unsigned binaries should not be the default production path

## Practical Recommendation For This Project

### Right now
- unsigned installer is acceptable for local engineering validation and controlled internal testing
- use it only on the dedicated dashboard server or an approved admin machine

### Before production rollout
- sign:
- installer executable
- any updater or launcher if introduced later

## If Code Signing Is Delayed
- use these compensating controls:
- distribute only through approved internal channels
- install only on the dedicated dashboard server
- restrict execution to a fixed install path
- allowlist by path or hash in endpoint security tooling
- document the application owner, expected binary names, and SHA256 hashes
- restrict who can log into the server and reach the admin web port

## Preferred Distribution Modes

### Best production path
- signed installer
- installed on the dedicated Windows server
- operator access through the operator web port in browser
- admin access through the admin web port in browser

### Acceptable interim path
- unsigned installer or offline bundle
- not for general user distribution
- only for controlled server-local deployment
- backed by security allowlisting if required

## Security Ownership Model
- IT dashboard team owns the application
- infrastructure/DBA team owns Postgres provisioning
- endpoint/security team owns allowlisting or signing acceptance

## Release Controls Recommended
- each release should record:
- version
- build date
- SHA256 hash of installer
- SHA256 hash of offline bundle zip
- target server/environment
- whether build is signed or unsigned

## Operational Rule
- wallboard/browser users never need direct server access
- only administrators should ever receive the deployment package or admin URL

## Final Recommendation
- development and early pilot: unsigned is acceptable
- controlled server use: acceptable with allowlisting if needed
- production corporate rollout: use signed binaries
