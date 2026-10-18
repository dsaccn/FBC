# Kogna Coffee POS — Agent Guidelines & Instructions

## 📓 Mandatory Automatic Obsidian Synchronization

The user maintains their central project documentation, requirements, and knowledge graph in their **Obsidian Vault**:
- **Vault Root**: `C:\Users\dawit\OneDrive\Documents\k\k`
- **Project Folder**: `C:\Users\dawit\OneDrive\Documents\k\k\Kogna Coffee POS`

### AUTOMATIC RULES (Execute Every Time Without Needing User Prompts):
1. **Pre-Task Check**:
   - Before implementing complex features or workflows, check the notes in `C:\Users\dawit\OneDrive\Documents\k\k\Kogna Coffee POS\` for any user-written specifications, business rules, or recipes.
2. **Post-Task Automatic Documentation (MANDATORY)**:
   - Every time code is created, modified, refactored, or fixed:
     - **Update `Changelog.md`**: Automatically log the date, summary of changes, and impacted files under `C:\Users\dawit\OneDrive\Documents\k\k\Kogna Coffee POS\Changelog.md`.
     - **Update Architecture / Feature Notes**: If database models, sync mechanisms, security policies, or UI components changed, update the relevant note (`System Architecture.md`, `Security Hardening.md`, etc.).
     - **Preserve Formatting**: Use Obsidian conventions (`[[wikilinks]]`, tags, YAML frontmatter, and Mermaid diagrams).
3. **Never Ask Permission**: The user has explicitly commanded: *"i want u to automatically use it ever time"*. Always perform these updates automatically as part of completing the task.
