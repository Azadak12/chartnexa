# Spec Delta

## REMOVED Requirements

### Requirement: Brand colors are the single source of truth
**Reason**: The owner replaced the white, black and blue light brand kit with the reference academy's dark palette on 2026-11-21.
**Migration**: See "Reference palette is the single source of truth" below.

## ADDED Requirements

### Requirement: Reference palette is the single source of truth
The app SHALL take colors from one shared token set that follows the reference academy: page `#070B14`, surface `#0F1628`, primary blue `#3D8BFF`, link blue `#6FA8FF`, gold highlight `#F5C542` (never used as a profit signal), and text `#E8EEFB`, plus neutral grays and functional status colors, and SHALL NOT use colors defined elsewhere.

#### Scenario: Token values
- **WHEN** the token set is inspected
- **THEN** the values match the reference palette and screens reference tokens, not literal colors

#### Scenario: Dark app surface
- **WHEN** a screen renders
- **THEN** the app background is the reference dark page color

### Requirement: Readable text
Body text SHALL be at least 17 points, secondary and small text at least 14 points, and bottom tab labels at least 12 points; headings SHALL use Plus Jakarta Sans and body text Inter; all text SHALL scale with the system text size.

#### Scenario: Type scale
- **WHEN** the type scale is inspected
- **THEN** body is 17, caption is 14 and tab labels are 12 points

#### Scenario: Large system text
- **WHEN** the system text size is at 200 percent
- **THEN** no text is clipped on the top bar, tab bar or cards

## MODIFIED Requirements

### Requirement: Readable contrast
Every text and background pairing defined by the tokens SHALL meet WCAG 2.1 AA contrast: 4.5:1 for normal text and 3:1 for large text and interactive component boundaries, including the lightened secondary text `#A9B7D4`.

#### Scenario: Automated contrast check
- **WHEN** the token pairings are evaluated
- **THEN** each text pairing is at least 4.5:1 and each large-text or control-border pairing is at least 3:1

#### Scenario: Status not by color alone
- **WHEN** a success, warning or error message is shown
- **THEN** it also carries an icon or text label so meaning does not rely on color
