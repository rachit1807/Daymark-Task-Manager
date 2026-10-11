# Daymark — Task Manager

Daymark is a responsive task manager built with HTML, CSS, and vanilla JavaScript. It was created for the Week 3, Task 3 web development project.

**Live demo:** [Open Daymark](https://rachit1807.github.io/Daymark-Task-Manager/)

## Features

- Create tasks with a title, notes, due date, priority, and category.
- Edit, complete, and delete tasks, with an option to undo a deletion.
- Search tasks and filter by status or category.
- Group tasks by due date and drag tasks to reorder them within a group.
- Switch between light and dark themes; the chosen theme is remembered in this browser.
- Export tasks to a JSON backup and import a backup by adding new tasks to the current list.
- View task totals and completion progress.
- Keep task data in the current browser with `localStorage`.

## Open the app

Open `index.html` in a modern web browser. The project has no package installation or build step.

## Data and backups

Tasks are saved in the browser and device where Daymark is opened; they do not automatically sync between browsers or devices. **Export backup** downloads a JSON file of your tasks. **Import backup** adds tasks from a JSON file to the current list and skips tasks with IDs that are already present.

## Project structure

```text
index.html
css/styles.css
js/app.js
assets/screenshots/
README.md
```

## GitHub Pages

The live demo is served from the repository’s `main` branch and root folder. To publish another copy, open **Settings → Pages**, select **Deploy from a branch**, then choose `main` and `/ (root)`.

## About the author

**Rachit Tripathi** · [GitHub profile](https://github.com/rachit1807)
