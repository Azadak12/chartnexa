# design-system Specification

## Purpose
Defines the shared look and accessibility rules of the ChartNexa app so every screen is consistent, readable and usable by everyone.

## Requirements

### Requirement: Brand colors are the single source of truth
The app SHALL take colors from one shared token set whose brand colors are exactly white #FFFFFF, black #111111 and blue #2563EB, with #EFF6FF as the blue tint, plus neutral grays and functional status colors, and SHALL NOT use colors defined elsewhere.

#### Scenario: Token values
- **WHEN** the token set is inspected
- **THEN** the brand values match the brand kit exactly and screens reference tokens, not literal colors

#### Scenario: Light app surface
- **WHEN** a screen renders
- **THEN** the app background is white and the whole app is not dark by default

### Requirement: Readable contrast
Every text and background pairing defined by the tokens SHALL meet WCAG 2.1 AA contrast: 4.5:1 for normal text and 3:1 for large text and interactive component boundaries.

#### Scenario: Automated contrast check
- **WHEN** the token pairings are evaluated
- **THEN** each text pairing is at least 4.5:1 and each large-text or control-border pairing is at least 3:1

#### Scenario: Status not by color alone
- **WHEN** a success, warning or error message is shown
- **THEN** it also carries an icon or text label so meaning does not rely on color

### Requirement: Comfortable touch targets
Every interactive control SHALL have a tappable area of at least 44 by 44 points.

#### Scenario: Small visual, large target
- **WHEN** an icon-sized control is rendered
- **THEN** its pressable area is at least 44 by 44 points

### Requirement: Scalable typography
Text SHALL use the Inter typeface with a system fallback, follow the system text size setting up to 200 percent, and SHALL NOT clip or overlap at that size.

#### Scenario: Large text setting
- **WHEN** the system text size is at its maximum supported scale
- **THEN** text, buttons and inputs grow with it and no text is cut off

#### Scenario: Font unavailable
- **WHEN** the Inter font has not loaded or fails to load
- **THEN** the app uses the system font and remains usable

### Requirement: Buttons and inputs express every state
Buttons SHALL support primary, secondary, tertiary, disabled and loading states, and a loading or disabled button SHALL NOT accept presses. Text inputs SHALL have a visible label and show errors in text linked to the field.

#### Scenario: Loading button
- **WHEN** a button is loading and is pressed repeatedly
- **THEN** its action does not run

#### Scenario: Input error
- **WHEN** an input has an error
- **THEN** the message appears next to the field, is announced by screen readers with the field, and is not shown by color alone

### Requirement: Assistive technology support
Interactive components SHALL expose roles, labels and states to screen readers, icon-only controls SHALL have text labels, and focus SHALL return to the control that opened a sheet or dialog when it closes.

#### Scenario: Icon-only control
- **WHEN** an icon-only control is rendered without an accessibility label
- **THEN** rendering it is rejected in development and tests

#### Scenario: Sheet closes
- **WHEN** a person closes a bottom sheet
- **THEN** focus returns to the control that opened it

### Requirement: Reduced motion
Animations SHALL be replaced with static or instant alternatives when the system reduced-motion setting is on.

#### Scenario: Skeleton with reduced motion
- **WHEN** reduced motion is enabled and a skeleton placeholder renders
- **THEN** it does not animate
