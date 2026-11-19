# mobile-lesson-resources Specification

## Purpose
The app screens for opening lesson files and for staff file uploads and management.

## Requirements

### Requirement: Students open lesson files
The lesson reader SHALL list the lesson's files with their type and size in words, open a file through a fresh link, and offer Download only when allowed, with loading, error and retry states.

#### Scenario: Open
- **WHEN** a student taps a file
- **THEN** the app gets a link and opens the file, announcing failures in words

### Requirement: Staff attach files on the lesson form
The lesson form SHALL let staff pick a file, see upload progress, cancel, retry a failed part, and then rename, toggle download, replace or delete files.

#### Scenario: Upload with progress
- **WHEN** staff pick a supported file
- **THEN** the app shows "Uploading, N percent" and announces when it is added
