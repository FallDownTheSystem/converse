---
id: task-004-add-partial-file-line-range-support
title: Add Partial File Line Range Support for Files Parameter
status: "Done"
created_date: '2025-11-26 11:06'
updated_date: '2025-11-26 13:49'
parent: null
subtasks: []
dependencies: []
---

## Description
<!-- DESCRIPTION:BEGIN -->
When users include files as context in chat or consensus tool requests, they currently must include the entire file. For large files, this wastes tokens and can dilute the AI's focus on the relevant portions.

This feature adds support for specifying line ranges when including files, allowing users to extract only the relevant portions. Using a simple syntax appended to the file path (e.g., `file.txt{5:37}`), users can specify exactly which lines to include.

**Example usage:**
- `src/utils/helper.js{10:50}` - Include lines 10 through 50
- `config.json{:20}` - Include from the start through line 20
- `README.md{100:}` - Include from line 100 to the end of the file

This makes it easier to focus the AI on specific functions, sections, or code blocks without including unnecessary context.
<!-- DESCRIPTION:END -->

## Specification
<!-- SPECIFICATION:BEGIN -->
### Syntax Definition
- **Format:** `path/to/file{start:end}` where `start` and `end` are line numbers
- **Line numbering:** 1-based (first line is line 1)
- **Both bounds inclusive:** `{5:10}` includes lines 5, 6, 7, 8, 9, and 10
- **Optional start:** `{:50}` means lines 1-50
- **Optional end:** `{100:}` means line 100 to end of file
- **No range specifier:** Normal behavior (entire file)

### Edge Cases
- **Out of bounds:** Clamp to actual file bounds (e.g., `{0:500}` on 300-line file → lines 1-300)
- **Start = 0:** Treat as 1 (first line)
- **Empty range `{:}`:** Return error immediately (same as file not found)
- **Invalid syntax (e.g., `{abc:xyz}`):** Treat as part of filename, fail on file not found
- **Negative numbers:** Treat as invalid syntax (part of filename)

### Acceptance Criteria
1. `file.txt{10:20}` extracts lines 10-20 inclusive
2. `file.txt{:50}` extracts lines 1-50
3. `file.txt{100:}` extracts lines 100 to EOF
4. `file.txt{:}` returns an error to the user
5. `file.txt{0:50}` extracts lines 1-50 (0 treated as 1)
6. `file.txt{200:300}` on a 150-line file extracts nothing (start > file length)
7. `file.txt{100:500}` on a 150-line file extracts lines 100-150
8. Both chat and consensus tools support this syntax
9. Tool schema descriptions updated with brief usage hint
10. Existing file paths without range specifiers work unchanged

### Error Handling
- Missing file: Existing error behavior (include error in context)
- Empty range `{:}`: Return error immediately with clear message
- Start > end: Return error immediately with clear message
<!-- SPECIFICATION:END -->

## Design
<!-- DESIGN:BEGIN -->
**Architecture Approach:** Late Parsing - parse line ranges inside `processFileContent()` in contextProcessor.js. This centralizes range handling as a file processing concern, provides a single source of truth, and keeps test isolation clean.

**Key Files:**
- `src/utils/pathParser.js` - NEW: Parse range syntax and extract line ranges
- `src/utils/fileValidator.js` - Import pathParser, strip range before `fs.access()` validation
- `src/utils/contextProcessor.js` - Import pathParser, apply range extraction after file read
- `src/tools/chat.js` - Update schema description (1 line)
- `src/tools/consensus.js` - Update schema description (1 line)
- `tests/utils/pathParser.test.js` - NEW: Unit tests for range parsing
- `tests/utils/contextProcessor.test.js` - Add integration tests with ranges

**Patterns to Follow:**
- Use existing `ContextProcessorError` for error handling with new codes (`EMPTY_RANGE`, `INVALID_RANGE`)
- Follow existing file processing flow: validate path → read file → transform content
- Match existing test patterns in contextProcessor.test.js

**Dependencies:** None - uses only built-in Node.js modules

**Context Manifest:**

### How File Processing Currently Works

When a user provides file paths to the chat or consensus tools (via the `files` or `images` parameters), the system processes those files through a well-orchestrated pipeline that validates paths, reads content, and formats everything for AI consumption. Here's the complete story from user request to AI context:

**The Entry Point - Tool Validation Phase:**

Both `src/tools/chat.js` (lines 180-189) and `src/tools/consensus.js` (lines 192-204) begin by validating file paths BEFORE any processing occurs. This early validation using `validateAllPaths()` from `src/utils/fileValidator.js` ensures that users get immediate, clear feedback if files don't exist. The validation happens at lines 47-49 of fileValidator.js, which uses Node's `fs/promises.access()` with `constants.R_OK` to check file readability. If validation fails, the function returns an error object via `createToolError()` (line 61 in fileValidator.js), which prevents any further processing and returns a formatted error response to the user.

The validation is path-aware: it handles both absolute paths (like `C:\Users\project\file.txt`) and relative paths (like `./src/config.js`). For relative paths, it resolves them against `config.server?.client_cwd` - a special working directory auto-detected from the client's environment (lines 43-45 of fileValidator.js). This means when Claude Code users provide relative paths, they're resolved from their actual project directory, not the server's location.

**The Processing Phase - Context Transformation:**

After validation passes, the tools call `contextProcessor.processUnifiedContext()` (chat.js lines 202-209, consensus.js lines 215-222). This unified processor from `src/utils/contextProcessor.js` (lines 285-327) orchestrates everything: it takes arrays of file paths and image paths, processes them in parallel using `processMultipleFiles()` (lines 221-250), and aggregates results with error isolation - meaning one bad file doesn't kill the entire batch.

The core processing happens in `processFileContent()` (lines 111-213 of contextProcessor.js). This function is where the magic happens:

**Path Resolution and Security:** First, it checks if the path is a data URL (base64 image, lines 114-138). If not, it calls `validateFilePath()` (lines 51-99) which converts relative paths to absolute paths (lines 63-65), optionally enforces security boundaries (lines 68-84, though this is disabled by default via `enforceSecurityCheck: false`), and verifies the file exists and is readable (lines 88-96). Any failure at this stage wraps into a `ContextProcessorError` with a descriptive code like `FILE_ACCESS_ERROR` or `SECURITY_VIOLATION`.

**File Type Detection:** Next, it determines the file type by examining the extension (line 144 with `extname()`). Anything matching the `SUPPORTED_IMAGE_EXTENSIONS` array (lines 35-42: jpg, jpeg, png, gif, webp, bmp) becomes type `'image'`, everything else becomes type `'text'`.

**Size Validation:** Before reading, it checks file sizes against configurable limits (lines 166-189): text files max 1MB by default, images max 10MB. If a file exceeds its limit, processing stops for that file and the result includes an error message, but other files continue processing.

**Content Reading:** For text files (lines 183-196), it reads content as UTF-8 strings, counts lines by splitting on `\r?\n` (line 193), and tracks character count. For images (lines 169-182), it reads the raw buffer and converts to base64 encoding for AI processing, adding the appropriate MIME type from the `getMimeType()` function (lines 414-437).

**Error Handling Architecture:**

The system has multiple layers of error handling, each serving a specific purpose:

1. **Validation Errors (Pre-Processing):** File not found errors from `fileValidator.js` return immediately via `createToolError()` from `src/tools/index.js` (lines 289-301). These are "hard" errors that stop execution because there's nothing to process. The error format includes a descriptive message like `"The following file could not be found: ./missing.txt"` (line 57 of fileValidator.js).

2. **Processing Errors (During Content Reading):** If `processFileContent()` encounters an error (file became inaccessible, read failure, etc.), it catches the exception (lines 199-212) and returns a result object with `type: 'error'`, the error message, and an error code. This is a "soft" error - the file fails but processing continues for other files.

3. **Error Inclusion in Context:** The `createFileContext()` function (lines 335-407 of contextProcessor.js) formats successful and failed files into a single context message. Errors are included in a `=== FILE ERRORS ===` section (lines 362-372) by default, unless `options.includeErrors` is explicitly set to false. This means the AI sees what failed and why, which helps it provide better responses.

**Message Assembly for AI:**

The final step is `createFileContext()` which builds the structured message that goes to the AI provider. For text files (lines 350-360), it creates a section with file paths as headers and content below. For images (lines 387-404), it creates special image content blocks with base64 data and MIME types that providers understand. The message follows the provider message format with `role: 'user'` and a `content` array containing text blocks and image blocks (lines 374-406).

In the tools (chat.js lines 252-266, consensus.js lines 254-268), this context message is combined with the user's prompt. The context message content gets prepended to the user's text prompt, ensuring files and images appear first, followed by the actual question.

**Current Line Reading Implementation:**

Currently, when text files are processed, the ENTIRE file content is read as a single string (line 191 of contextProcessor.js: `await readFile(validatedPath, 'utf8')`). The system counts lines for metadata purposes (line 193: `content.split(/\r?\n/).length`) but doesn't expose any way to extract specific line ranges. The complete file content is passed through to the AI context without any filtering or subsetting.

### For New Feature Implementation: Adding Line Range Support

To implement `file.txt{5:37}` syntax, we need to intercept file paths at multiple points in the pipeline and extract range information BEFORE path validation occurs. Here's what needs to connect:

**Parsing Layer (New):** Create a utility function (suggested location: `src/utils/pathParser.js` or add to `contextProcessor.js`) that parses file paths and extracts range specifiers. This function should:
- Use regex to match the `{start:end}` pattern at the end of paths
- Return an object: `{ filePath: 'path/to/file.txt', range: { start: 5, end: 37 } }`
- Handle edge cases: `{:50}`, `{100:}`, `{:}`, `{0:50}`, invalid syntax
- Normalize start line: treat 0 as 1, handle missing start/end

**Validation Integration:** The `validateFilePath()` function in `contextProcessor.js` (lines 51-99) currently expects pure file paths. We'll need to either:
- Strip the range specifier BEFORE validation, OR
- Modify validation to accept paths with ranges and strip them internally

Stripping BEFORE validation is cleaner because it keeps validation focused on path security, not syntax parsing.

**File Reading Modification:** The `processFileContent()` function (lines 111-213) needs enhancement at the text file reading section (lines 183-196). Currently:
```javascript
const content = await readFile(validatedPath, 'utf8');
result.content = content;
result.lineCount = content.split(/\r?\n/).length;
```

This must become:
```javascript
let content = await readFile(validatedPath, 'utf8');
const lines = content.split(/\r?\n/);
result.lineCount = lines.length;

// Apply line range filtering if range was specified
if (range) {
  const { start, end } = range;
  // Validate and clamp range to actual file bounds
  // Extract lines[start-1 : end] (adjusting for 0-indexed arrays)
  content = extractedLines.join('\n');
}

result.content = content;
```

**Error Handling for Invalid Ranges:** The spec requires specific error behaviors:
- `{:}` (empty range): Return error immediately, same as file not found
- Start > end: Return error with clear message
- Start > file length: Extract nothing (return empty content or error?)

These errors should be caught during path parsing or after reading the file, and should use the existing `ContextProcessorError` pattern with appropriate codes like `INVALID_RANGE` or `EMPTY_RANGE`.

**Tool Schema Updates:** Both `chat.js` and `consensus.js` have `inputSchema` definitions at the end of their files (chat.js lines 1010-1082, consensus.js lines 1612-1690). The `files` parameter descriptions (chat.js lines 1018-1022, consensus.js lines 1622-1626) should be updated to briefly mention the line range syntax:
```javascript
description: 'File paths to include as context (absolute or relative paths). Supports line ranges: "file.txt{10:20}" for lines 10-20. Example: ["C:\\Users\\username\\project\\src\\auth.js{50:100}", "./config.json"]'
```

**Testing Implications:** The existing test suite at `tests/utils/contextProcessor.test.js` tests path resolution, validation, and content reading. New tests will need to cover:
- Range parsing for all edge cases
- Line extraction accuracy (boundary conditions)
- Error handling for invalid ranges
- Integration with existing validation flow
- Both absolute and relative paths with ranges

**Architecture Decision:** We have two implementation choices:

1. **Early Parsing:** Parse and strip ranges at the tool level (in chat.js and consensus.js) before passing to contextProcessor. This keeps contextProcessor focused on file I/O.

2. **Late Parsing:** Parse ranges inside `processFileContent()`. This centralizes range handling but couples the processor to the syntax.

**Recommendation:** Late Parsing (option 2) is better because:
- Range handling is a file processing concern, not a tool concern
- Single source of truth for path syntax
- Easier to reuse if other tools need files later
- Test isolation: range logic tested in contextProcessor tests only

### Technical Reference Details

#### File Paths and Key Functions

**Primary Implementation Files:**
- `C:\Users\Juugo\Documents\Projects\converse\src\utils\contextProcessor.js`
  - `processFileContent(filePath, options)` - lines 111-213 (main processing function)
  - `validateFilePath(filePath, options)` - lines 51-99 (path validation)
  - `createFileContext(processedFiles, options)` - lines 335-407 (context formatting)

- `C:\Users\Juugo\Documents\Projects\converse\src\utils\fileValidator.js`
  - `validateFilePaths(filePaths, fileType, options)` - lines 19-66 (pre-processing validation)

- `C:\Users\Juugo\Documents\Projects\converse\src\tools\chat.js`
  - File validation: lines 180-189
  - Context processing: lines 194-232
  - Schema definition: lines 1018-1022

- `C:\Users\Juugo\Documents\Projects\converse\src\tools\consensus.js`
  - File validation: lines 192-204
  - Context processing: lines 206-238
  - Schema definition: lines 1622-1626

**New File (Suggested):**
- `C:\Users\Juugo\Documents\Projects\converse\src\utils\pathParser.js`
  - `parseFilePathWithRange(filePath)` - Extract range from path syntax
  - `extractLineRange(content, range)` - Extract specific lines from content

#### Key Data Structures

**Processed File Result Object:**
```javascript
{
  path: '/absolute/path/to/file.txt',        // Absolute resolved path
  originalPath: './relative/file.txt',       // Path as user provided it
  size: 1024,                                 // File size in bytes
  extension: '.txt',                          // File extension
  type: 'text',                               // 'text', 'image', or 'error'
  content: 'file contents here...',           // UTF-8 string or base64
  error: null,                                // Error message if failed
  lastModified: Date,                         // File modification date
  encoding: 'utf8',                           // 'utf8' or 'base64'
  lineCount: 42,                              // Number of lines (text only)
  charCount: 1024                             // Character count (text only)
}
```

**New Range Object (Proposed):**
```javascript
{
  start: 5,      // Starting line number (1-indexed, null = start of file)
  end: 37,       // Ending line number (1-indexed, null = end of file)
  isEmpty: false // True for invalid range like {:}
}
```

#### Configuration & Options

**Options passed to processFileContent:**
```javascript
{
  enforceSecurityCheck: false,              // Enable path security validation
  allowedDirectories: ['/allowed/paths'],   // Allowed parent directories
  clientCwd: '/client/working/directory',   // Client's working directory
  maxTextSize: 1048576,                     // Max text file size (1MB default)
  maxImageSize: 10485760,                   // Max image size (10MB default)
  skipSecurityCheck: true                   // Legacy flag, same as !enforceSecurityCheck
}
```

#### Error Codes and Handling

**Error Creation Pattern:**
```javascript
throw new ContextProcessorError(
  'Human-readable error message',
  'ERROR_CODE',                    // Used for programmatic handling
  { path: absolutePath }           // Additional context details
);
```

**Existing Error Codes:**
- `INVALID_PATH` - Path is null, empty, or not a string
- `SECURITY_VIOLATION` - Path outside allowed directories
- `FILE_ACCESS_ERROR` - File doesn't exist or not readable
- `NOT_A_FILE` - Path points to a directory
- `INVALID_DATA_URL` - Malformed base64 data URL
- `INVALID_INPUT` - Invalid function parameters

**Proposed New Error Codes:**
- `EMPTY_RANGE` - Range specifier is `{:}` with no start or end
- `INVALID_RANGE` - Start > end or malformed range syntax
- `RANGE_OUT_OF_BOUNDS` - Range exceeds file boundaries (if we want to error vs. clamp)

#### Tool Error Response Format

When `createToolError()` is called (from `src/tools/index.js` lines 289-301), it returns:
```javascript
{
  content: [
    {
      type: 'text',
      text: 'Error message here'
    }
  ],
  isError: true,
  error: {
    message: 'Error message here',
    type: 'ToolError',
    timestamp: '2024-01-01T12:00:00.000Z'
  }
}
```

This format is what chat and consensus tools return when validation fails.

#### Test Files

**Existing Tests:**
- `C:\Users\Juugo\Documents\Projects\converse\tests\utils\contextProcessor.test.js` - Unit tests for file processing
- `C:\Users\Juugo\Documents\Projects\converse\tests\utils\fileValidator.test.js` - Unit tests for validation
- `C:\Users\Juugo\Documents\Projects\converse\tests\tools\chat.test.js` - Integration tests for chat tool
- `C:\Users\Juugo\Documents\Projects\converse\tests\tools\consensus.test.js` - Integration tests for consensus tool

**New Tests Needed:**
- Path parsing tests (all edge cases from spec)
- Line extraction tests (boundary conditions, empty files)
- Integration tests in chat/consensus tools with range syntax
- Error handling tests for invalid ranges
<!-- DESIGN:END -->

## TODO
<!-- TODO:BEGIN -->
- [x] Create `src/utils/pathParser.js` with:
  - `parseFilePathWithRange(filePath)` - regex `^(.*)\{(\d*):(\d*)\}$/` anchored to end
  - Return `{ filePath, range: { start, end, isEmpty } }` or `{ filePath, range: null }`
  - Handle edge cases: `{:50}`, `{100:}`, `{:}`, `{0:50}`, invalid syntax
  - `extractLineRange(lines, range)` - use `lines.slice(start - 1, end)`
  - Clamp to actual bounds, normalize start=0 to 1
- [x] Update `validateFilePaths()` in fileValidator.js
  - Import pathParser
  - Strip range BEFORE `fs.access()` call to avoid ENOENT on valid files
- [x] Update `processFileContent()` in contextProcessor.js
  - Import pathParser
  - Error on empty range `{:}` BEFORE `readFile()` for performance
  - After reading, apply `extractLineRange()` if range provided
  - Add `result.totalLineCount` for full file, `result.lineCount` for extracted portion
- [x] Update chat.js schema `files` description with brief syntax hint
- [x] Update consensus.js schema `files` description with brief syntax hint
- [x] Create `tests/utils/pathParser.test.js` for parsing edge cases
- [x] Add integration tests in contextProcessor.test.js for file processing with ranges
<!-- TODO:END -->

## Notes
<!-- NOTES:BEGIN -->
**Review Feedback (Gemini - conv_GIV28C86fC):**

1. **Validator Trap (Critical):** Must parse and strip range in `fileValidator.js` BEFORE `fs.access()` call, otherwise `file.txt{5:10}` will throw `ENOENT`. Import pathParser in fileValidator to avoid duplicating regex logic.

2. **Regex Pattern:** Use `^(.*)\{(\d*):(\d*)\}$/` anchored to end of string. Be strict about no whitespace inside braces.

3. **Array Slicing:** Use `lines.slice(start - 1, end)` - end is exclusive in slice but inclusive in our spec, so this works correctly.

4. **Performance:** Error on invalid range `{:}` BEFORE the expensive `readFile` operation.

5. **Metadata Enhancement:** Consider adding `result.totalLineCount` alongside `result.lineCount` so AI knows it's viewing a fragment.

**Decision:** Create separate `src/utils/pathParser.js` file for cleaner imports in both fileValidator.js and contextProcessor.js.

---

**Implementation Complete (2025-11-26):**

All acceptance criteria met. Implementation creates:
- `src/utils/pathParser.js` - 3 exported functions: `parseFilePathWithRange()`, `extractLineRange()`, `validateRange()`
- Updated `src/utils/fileValidator.js` - strips range before `fs.access()` validation
- Updated `src/utils/contextProcessor.js` - parses range, validates early, extracts lines after read
- Updated schema descriptions in `chat.js` and `consensus.js` with syntax hints
- `tests/utils/pathParser.test.js` - 34 unit tests covering all parsing edge cases
- `tests/utils/contextProcessor.test.js` - 15 new integration tests for line range processing

All 62 tests pass. The context header includes range info when a partial file is displayed: `(lines 10-50 of 200)`.
<!-- NOTES:END -->
