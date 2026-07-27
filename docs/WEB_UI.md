# Web UI Guide

The browser interface is the main day-to-day way to use Debate Lab. It is designed as an operations surface rather than a landing page: you open it, add material, configure a run, inspect results, and move on.

## Screen layout

The screen is split into three working zones:

- left sidebar for navigation and profile
- center arena for the live debate and report viewer
- right panel for configuration, files, folders, and drafts

## Sidebar

The sidebar gives you access to the main areas:

- Dashboard
- New Debate
- History
- Files
- Documentation
- Support
- Settings

The top button collapses the sidebar on desktop. On smaller screens the sidebar becomes an overlay.

The top-right account menu gives you quick access to profile settings, theme switching, and logout without leaving the current page.

## Arena workflow

In the arena you can:

- choose the topic
- choose a mode and goal
- choose the persona
- select agents
- set the number of rounds
- upload files or create folders
- clone a GitHub repository
- run the debate

When the debate is live, the transcript fills in as each agent responds. If you enable human turns, the center feed pauses for your response when needed.

## Upload flow

Treat the right panel as a workspace manager rather than a simple file picker.

1. Upload a file.
2. Create folders for your project structure.
3. Clone a repository if the review target is code.
4. Keep notes and chats in your workspace.

## Profile and avatar settings

The profile settings let you choose:

- display name
- gender
- pronouns
- avatar style
- avatar accent color
- whether to use the GitHub avatar

Those settings are meant to make the identity layer feel personal rather than generic.

You can open them from the top-right account menu or from the Settings page.

## Report view

After a run, the report is saved automatically and can be reopened from History. You can:

- export the report as markdown
- ask follow-up questions about the report
- save the conversation in your workspace

The follow-up chat now reopens with the previous conversation for that report so you can continue naturally instead of starting from zero.

## Resources page

The Resources page is a documentation launcher, not a wall of text. It contains:

- a list of guides
- links that open the full docs pages
- quick start prompts
- workflow tips

The deeper content lives in the dedicated docs pages so each guide has room for code, screenshots, and longer explanations.

## Tips

- Use `--agents groq` in the CLI or the UI if you want a quick low-cost test.
- Save chats if you want to keep a record of the discussion around a report.
- Create nested folders to keep long projects organized.
- Open the Workspace Guide when you want a step-by-step file workflow.
