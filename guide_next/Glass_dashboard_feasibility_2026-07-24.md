# Glass Dashboard Feasibility Plan

Date: 2026-07-24
Branch: `feat-glass`
Scope: full operator dashboard visual language review only. No dashboard-wide glass redesign has been implemented in this pass.

## Executive Verdict

Yes, the dashboard can adopt the reference visual language across the full experience, but not as a literal copy of the same tile everywhere.

The reference tile works well for:
- large KPI tiles
- queue counters
- summary status chips
- standalone cards with low information density

The reference tile does **not** translate well as-is to:
- dense server rows
- network charts and sparkline regions
- long health pills and error pills
- compact metadata tags

The correct approach is:
- one **shared glass design language**
- four **surface variants**
- selective use of embossing, inner highlights, and metallic texture based on information density

## Current Architecture Validation

Validated against the current code structure:
- [dashboard/src/app/globals.css](C:/Users/omkar.s/Code/samixa/dashboard/src/app/globals.css)
- [dashboard/src/app/page.tsx](C:/Users/omkar.s/Code/samixa/dashboard/src/app/page.tsx)
- [dashboard/src/components/UnifiedNetworkCard.tsx](C:/Users/omkar.s/Code/samixa/dashboard/src/components/UnifiedNetworkCard.tsx)

What is favorable:
- the app already uses shared CSS tokens in `:root`
- there is already a `glass-panel` base surface
- most major dashboard regions are structurally separated
- the dashboard already follows a controlled color system for status states

What makes this non-trivial:
- many important visuals are still inline-styled in `page.tsx`
- the network card has its own dense rendering path outside the main page file
- the same design language must work for both large wallboard cards and dense row/table content

Conclusion:
- feasible without a rewrite
- not feasible as a single CSS-only swap
- safest path is a staged variant rollout

## Recommended Design System

Introduce one base design language and four variants.

### 1. `glass-hero`
Use for:
- HSD queue tiles
- top KPI counters
- HCI headline metrics

Characteristics:
- embossed rounded rectangle
- stronger inner highlight
- deeper outer shadow
- optional brushed-metal or soft satin texture
- large centered type

### 2. `glass-compact`
Use for:
- server summary pills
- small status chips
- health/state badges

Characteristics:
- flatter than `glass-hero`
- lighter depth
- tighter padding
- still rounded, but not bulky

### 3. `glass-dense`
Use for:
- server metric cells
- compact metadata strips
- state pills inside dense cards

Characteristics:
- minimal embossing
- stronger contrast than decorative styling
- priority on scan speed and readability
- texture either removed or nearly invisible

### 4. `glass-chart`
Use for:
- network chart areas
- HSD chart region
- server trend region

Characteristics:
- mostly a quiet container
- very subtle glass edge and depth
- charts remain the visual priority
- no heavy embossing behind lines/sparklines

## Applicability by Dashboard Area

| Area | Feasible | Recommended Treatment | Notes |
|---|---|---|---|
| HSD queue tiles | Yes | `glass-hero` | Best fit for the reference style |
| HSD SLA cards | Yes | `glass-compact` / `glass-hero-lite` | Keep numbers and rails readable |
| HSD about-to-miss tile | Yes | `glass-compact` | Ticket refs need contrast over ornament |
| HCI summary chips | Yes | mixed | Main metrics can be hero-lite, node/status pieces compact |
| Network header metrics | Yes | `glass-compact` | Good fit if texture remains subtle |
| Network chart body | Partially | `glass-chart` | Do not place heavy metallic texture behind sparkline data |
| Network path/status pills | Yes | `glass-compact` | Strong fit |
| Server summary pills | Yes | `glass-compact` | Good fit, already structurally close |
| Server row metric bars | Yes | `glass-dense` | Must remain slim and scan-friendly |
| Server row tags | Yes | `glass-dense` | Keep low-profile |
| Error / datalink pills | Yes | `glass-compact-alert` | Needs clear severity over decoration |
| Footer / header shell | Yes | `glass-shell` | Subtle only, not hero style |

## What Should Not Be Literal

Do **not** apply the exact reference styling to all of the following:
- CPU/RAM/DSK/AVL row bars
- network sparkline containers
- chart plotting areas
- long text pills containing timestamps or collector errors
- tiny meta tags like `NX`, `SW45`, `HCI-WIN`

Reason:
- embossed center-heavy tiles reduce scan speed in dense operational views
- metallic texture behind charts reduces contrast and visual accuracy
- repeated deep shadows across every small element will make the wallboard look noisy and heavy

## Visual Principles for the Rollout

If this is implemented, the design should follow these rules:

1. Status color must remain semantic.
2. Decoration must never reduce metric readability from wallboard distance.
3. Texture must be subtle and used mainly on hero/summary surfaces.
4. Dense surfaces must prioritize contrast and compactness over visual effect.
5. Charts should sit on calmer surfaces than counters.

## Recommended Rollout Sequence

### Phase 1: Design Tokens

Add shared tokens for:
- highlight layer
- inset shadow strength
- outer shadow strength
- glass tint by surface type
- texture opacity
- hero/compact/dense radius values

Deliverable:
- new glass token group in `globals.css`

### Phase 2: Surface Variants

Create reusable surface classes or helper wrappers for:
- `glass-hero`
- `glass-compact`
- `glass-dense`
- `glass-chart`
- `glass-alert`

Deliverable:
- reusable styling primitives replacing repeated inline treatment

### Phase 3: HSD Pilot

Apply the new language first to:
- special queue tiles
- SLA tiles
- about-to-miss tile

Reason:
- this is the closest match to the user reference
- easiest place to validate readability and style direction

### Phase 4: HCI and Server Header

Apply to:
- HCI metrics
- server summary pills
- section headers

Reason:
- high impact, relatively low risk

### Phase 5: Network and Dense Server Areas

Apply carefully to:
- network header metrics
- network status strips
- server metric bars
- server row tags and state pills

Reason:
- these need the most adaptation and the least decoration

### Phase 6: Mobile and Portrait Validation

Re-check:
- portrait overlap
- compact surfaces on Safari/iPhone
- desktop wallboard priority at 1920x1200 and 1920x1080

## Validation Criteria

The redesign should only be accepted if all of the below remain true:

- primary wallboard resolution still reads clearly at distance
- server row scan speed does not get worse
- network sparklines remain more prominent than their containers
- error pills remain immediately recognizable
- color semantics remain unchanged
- mobile layout remains usable without horizontal overflow

## Risks

### Readability Risk
Highest risk area:
- network card
- server table rows

Mitigation:
- use `glass-dense` and `glass-chart` instead of full hero embossing

### Performance Risk
Heavy layered blur, texture, and shadow across the whole dashboard can increase paint cost.

Mitigation:
- avoid strong `backdrop-filter` on every nested element
- prefer static gradients and subtle texture overlays over expensive blur stacks

### Consistency Risk
If some tiles get a literal metallic treatment and others remain plain, the dashboard can feel visually inconsistent.

Mitigation:
- establish variants first
- then migrate region by region

## Implementation Recommendation

Recommended answer to the question "can we achieve this design everywhere?":

Yes, but the right target is:
- one unified glass/embossed design system
- not one literal tile replicated everywhere

Recommended next execution branch work:
1. build shared glass variants
2. pilot on HSD first
3. validate on wallboard
4. then expand to HCI, server summary, network summary, and dense surfaces

## Suggested Next Step

If approved, the next implementation pass on `feat-glass` should be:

1. create glass design tokens in `globals.css`
2. convert HSD special queue tiles into the hero reference style
3. convert one additional dense area using the adapted variant
4. visually compare before extending across the rest of the dashboard

This gives a safe validation loop before the whole dashboard is re-skinned.
