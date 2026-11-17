# Spec Delta

## Purpose

Defines how people move through the ChartNexa app without losing their place: protected areas, returning after sign-in, back behavior, remembered list position, and unknown links.

## ADDED Requirements

### Requirement: Protected area and sign-in return
The app SHALL keep signed-in screens behind a session check and, when a signed-out person opens one, SHALL send them to sign-in remembering the route and parameters they wanted, then return them there after sign-in.

#### Scenario: Deep link while signed out
- **WHEN** a signed-out person opens a link to a signed-in screen with parameters
- **THEN** they see the sign-in screen, and after signing in they arrive at that same screen with the same parameters

#### Scenario: No destination
- **WHEN** a person signs in without a remembered destination
- **THEN** they arrive at Home

#### Scenario: Session expires mid-use
- **WHEN** the session ends while a person is on a signed-in screen
- **THEN** they are sent to sign-in and return to that screen after signing in again

### Requirement: Safe return destination
The remembered destination SHALL only ever be an internal app route, and any other value SHALL be ignored in favor of Home.

#### Scenario: External or malformed destination
- **WHEN** the remembered destination is a full URL, begins with two slashes, includes a scheme, or is not a known route format
- **THEN** it is ignored and the person goes to Home after sign-in

### Requirement: Overlays close before navigation
Hardware back on Android and the system back gesture SHALL close the topmost open overlay (sheet or dialog) first and only navigate back when no overlay is open.

#### Scenario: Sheet open
- **WHEN** a bottom sheet is open and the person presses back
- **THEN** the sheet closes and the screen underneath stays where it was

#### Scenario: Nested overlays
- **WHEN** a dialog is open above a sheet and the person presses back twice
- **THEN** the dialog closes first, then the sheet, and the screen is unchanged

#### Scenario: No overlay
- **WHEN** no overlay is open and the person presses back on a pushed screen
- **THEN** the previous screen is shown

### Requirement: List position is remembered
Returning to a list screen SHALL restore its scroll position and active filters.

#### Scenario: Open an item and return
- **WHEN** a person scrolls a list, applies a filter, opens an item and goes back
- **THEN** the list shows the same filter and scroll position as before

#### Scenario: Different list
- **WHEN** a person opens a different list
- **THEN** it does not inherit the first list's position or filters

### Requirement: Tabs keep their own state
Switching between the main tabs SHALL NOT reset what each tab was showing.

#### Scenario: Switch tabs and back
- **WHEN** a person navigates deep within one tab, switches to another and returns
- **THEN** the first tab still shows the screen they left

### Requirement: Unknown links are handled
Opening a route that does not exist SHALL show a friendly not-found screen with a clear way back to Home, and SHALL NOT crash or show technical text.

#### Scenario: Unknown deep link
- **WHEN** a person opens a link to a route the app does not have
- **THEN** a not-found screen appears with a button to Home
