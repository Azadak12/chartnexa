# Spec Delta

## ADDED Requirements

### Requirement: Courses show an instructor, a category and a thumbnail
Public course responses SHALL include the category name, the instructor (id and display name) and a thumbnail address; cards and details SHALL show them, falling back to the colour cover when no image exists or it cannot load.

#### Scenario: Broken image
- **WHEN** the thumbnail cannot be loaded
- **THEN** the colour cover is shown and the card is still usable

### Requirement: Staff set thumbnails safely
People who may update a course SHALL set a PNG, JPEG or WebP image up to 2 MB. The type SHALL be decided from the bytes, replacing SHALL remove the old image, and other people SHALL be refused.

#### Scenario: Disguised file
- **WHEN** a text or script file is uploaded as a thumbnail
- **THEN** it is refused and nothing is stored
