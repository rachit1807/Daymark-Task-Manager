const STORAGE_KEY = 'daymark.tasks.v1';
const PREFERENCES_KEY = 'daymark.preferences.v1';
const CATEGORIES = {
  general: 'General',
  work: 'Work',
  study: 'Study',
  personal: 'Personal',
};
const GROUPS = ['overdue', 'today', 'upcoming', 'undated', 'completed'];
const GROUP_LABELS = {
  overdue: 'Overdue',
  today: 'Due today',
  upcoming: 'Upcoming',
  undated: 'No due date',
  completed: 'Completed',
};

const taskList = document.querySelector('#task-list');
const taskForm = document.querySelector('#task-form');
const taskTitleInput = document.querySelector('#task-title');
const searchInput = document.querySelector('#task-search');
const categoryFilter = document.querySelector('#category-filter');
const clearCompletedButton = document.querySelector('#clear-completed');
const themeToggle = document.querySelector('#theme-toggle');
const themeLabel = document.querySelector('#theme-label');
const importFileInput = document.querySelector('#import-file');
const toast = document.querySelector('#toast');
const toastMessage = document.querySelector('#toast-message');
const undoButton = document.querySelector('#undo-button');

let tasks = readTasks();
let activeFilter = 'all';
let activeCategory = 'all';
let searchTerm = '';
let undoSnapshot = null;
let toastTimer;
let draggedTaskId = null;
let dragStartedFromHandle = false;

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && localDateKey(date) === value;
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeTask(task, index = 0) {
  return {
    id: typeof task?.id === 'string' && task.id ? task.id : makeId(),
    title: typeof task?.title === 'string' ? task.title.trim().slice(0, 100) : '',
    notes: typeof task?.notes === 'string' ? task.notes.trim().slice(0, 240) : '',
    dueDate: isValidDate(task?.dueDate) ? task.dueDate : '',
    priority: ['high', 'normal', 'low'].includes(task?.priority) ? task.priority : 'normal',
    category: Object.hasOwn(CATEGORIES, task?.category) ? task.category : 'general',
    completed: Boolean(task?.completed),
    createdAt: Number(task?.createdAt) || Date.now(),
    order: Number.isFinite(Number(task?.order)) ? Number(task.order) : index,
  };
}

function readTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved
      .filter((task) => task && typeof task.title === 'string' && task.title.trim())
      .map((task, index) => normalizeTask(task, index));
  } catch (error) {
    console.warn('Saved tasks could not be read.', error);
    return [];
  }
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (error) {
    console.warn('Tasks could not be saved in this browser.', error);
    showToast('Could not save on this device', null);
    return false;
  }
  return true;
}

function readPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || '{}');
    return { theme: saved.theme === 'dark' ? 'dark' : 'light' };
  } catch (error) {
    return { theme: 'light' };
  }
}

function savePreferences(preferences) {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch (error) {
    showToast('Theme preference could not be saved', null);
  }
}

function setTheme(theme, persist = true) {
  const selectedTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = selectedTheme;
  themeToggle.setAttribute('aria-pressed', String(selectedTheme === 'dark'));
  themeToggle.setAttribute('aria-label', selectedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  themeLabel.textContent = selectedTheme === 'dark' ? 'Light mode' : 'Dark mode';
  document.querySelector('meta[name="theme-color"]').content = selectedTheme === 'dark' ? '#17211f' : '#f3f5f4';
  if (persist) savePreferences({ theme: selectedTheme });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getGroupKey(task) {
  if (task.completed) return 'completed';
  if (!task.dueDate) return 'undated';
  const today = localDateKey();
  if (task.dueDate < today) return 'overdue';
  if (task.dueDate === today) return 'today';
  return 'upcoming';
}

function getDueState(value, completed) {
  if (!value || completed) return '';
  const group = getGroupKey({ dueDate: value, completed: false });
  if (group === 'overdue') return 'is-overdue';
  if (group === 'today') return 'is-today';
  return '';
}

function canReorderTasks() {
  return activeFilter === 'all' && activeCategory === 'all' && !searchTerm.trim();
}

function getVisibleTasks() {
  const normalizedQuery = searchTerm.trim().toLocaleLowerCase();
  const groupOrder = new Map(GROUPS.map((group, index) => [group, index]));
  return tasks
    .filter((task) => {
      if (activeFilter === 'active' && task.completed) return false;
      if (activeFilter === 'completed' && !task.completed) return false;
      if (activeCategory !== 'all' && task.category !== activeCategory) return false;
      if (!normalizedQuery) return true;
      const searchable = `${task.title} ${task.notes} ${CATEGORIES[task.category]}`.toLocaleLowerCase();
      return searchable.includes(normalizedQuery);
    })
    .sort((first, second) => {
      const firstGroup = getGroupKey(first);
      const secondGroup = getGroupKey(second);
      const groupDifference = groupOrder.get(firstGroup) - groupOrder.get(secondGroup);
      if (groupDifference) return groupDifference;
      if (first.order !== second.order) return first.order - second.order;
      return first.createdAt - second.createdAt;
    });
}

function renderTask(task) {
  const title = escapeHtml(task.title);
  const notes = escapeHtml(task.notes);
  const isComplete = task.completed;
  const priorityName = task.priority[0].toUpperCase() + task.priority.slice(1);
  const categoryName = CATEGORIES[task.category];
  const dueState = getDueState(task.dueDate, isComplete);
  const dueMarkup = task.dueDate
    ? `<span class="due-tag ${dueState}">${dueState === 'is-overdue' ? 'Overdue · ' : ''}${escapeHtml(formatDate(task.dueDate))}</span>`
    : '';
  const notesMarkup = task.notes ? `<p class="task-notes">${notes}</p>` : '';
  const draggable = canReorderTasks();

  return `<li class="task-card ${isComplete ? 'is-complete' : ''}" data-task-id="${escapeHtml(task.id)}" draggable="${draggable}">
    <button class="drag-handle" type="button" tabindex="-1" aria-label="Drag to reorder ${title}" title="Drag to reorder">⠿</button>
    <button class="check-button" type="button" data-action="toggle" aria-label="${isComplete ? 'Mark as in progress' : 'Mark as complete'}: ${title}" aria-pressed="${isComplete ? 'true' : 'false'}">✓</button>
    <div class="task-content">
      <div class="task-title-row"><h3 class="task-title">${title}</h3><span class="priority-tag priority-${task.priority}">${priorityName}</span></div>
      ${notesMarkup}
      <div class="task-meta"><span class="category-tag category-${task.category}">${escapeHtml(categoryName)}</span>${dueMarkup}${isComplete ? '<span class="due-tag complete-tag">Completed</span>' : ''}</div>
    </div>
    <div class="task-actions" aria-label="Task actions">
      <button class="task-action" type="button" data-action="edit" aria-label="Edit ${title}">Edit</button>
      <button class="task-action delete" type="button" data-action="delete" aria-label="Delete ${title}">Delete</button>
    </div>
  </li>`;
}

function renderGroupHeading(group, count) {
  return `<li class="task-group-heading"><h3>${GROUP_LABELS[group]}</h3><span>${count}</span></li>`;
}

function renderEmptyState() {
  if (searchTerm.trim()) {
    return '<li class="empty-state"><h3>No matching tasks</h3><p>Try another search term or clear the search field.</p></li>';
  }
  if (activeCategory !== 'all') {
    return `<li class="empty-state"><h3>No ${escapeHtml(CATEGORIES[activeCategory])} tasks</h3><p>Tasks assigned to this category will appear here.</p></li>`;
  }
  if (activeFilter === 'completed') {
    return '<li class="empty-state"><h3>No completed tasks</h3><p>Tasks you mark complete will appear here.</p></li>';
  }
  if (activeFilter === 'active' && tasks.length > 0) {
    return '<li class="empty-state"><h3>No open tasks</h3><p>All current tasks are complete.</p></li>';
  }
  return '<li class="empty-state"><h3>No tasks yet</h3><p>Create a task above to start organizing your work.</p></li>';
}

function updateCounts() {
  const total = tasks.length;
  const completed = tasks.filter((task) => task.completed).length;
  const active = total - completed;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  const visibleCount = getVisibleTasks().length;

  document.querySelector('#total-count').textContent = total;
  document.querySelector('#active-count').textContent = active;
  document.querySelector('#completed-count').textContent = completed;
  document.querySelector('#nav-all-count').textContent = total;
  document.querySelector('#nav-active-count').textContent = active;
  document.querySelector('#nav-completed-count').textContent = completed;
  document.querySelector('#tab-all-count').textContent = total;
  document.querySelector('#tab-active-count').textContent = active;
  document.querySelector('#tab-completed-count').textContent = completed;
  document.querySelector('#board-count').textContent = visibleCount;
  document.querySelector('#progress-percent').textContent = `${percent}%`;
  document.querySelector('#progress-done').textContent = completed;
  document.querySelector('#progress-total').textContent = total;
  document.querySelector('#progress-fill').style.width = `${percent}%`;
  document.querySelector('#progress-bar').setAttribute('aria-valuenow', String(percent));
  document.querySelector('#progress-message').textContent = total === 0
    ? 'Add a task to begin tracking progress.'
    : completed === total
      ? 'All tasks are complete.'
      : completed > 0
        ? 'Some tasks are complete.'
        : 'Complete a task to update progress.';
  clearCompletedButton.hidden = completed === 0;
}

function syncFilterButtons() {
  document.querySelectorAll('[data-filter]').forEach((button) => {
    const selected = button.dataset.filter === activeFilter;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function render() {
  const visible = getVisibleTasks();
  if (!visible.length) {
    taskList.innerHTML = renderEmptyState();
  } else {
    const groups = new Map();
    visible.forEach((task) => {
      const group = getGroupKey(task);
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(task);
    });
    taskList.innerHTML = GROUPS
      .filter((group) => groups.has(group))
      .map((group) => `${renderGroupHeading(group, groups.get(group).length)}${groups.get(group).map(renderTask).join('')}`)
      .join('');
  }
  updateCounts();
  syncFilterButtons();
  document.querySelector('#board-hint').textContent = canReorderTasks()
    ? 'Tasks are grouped by due date. Drag the handle to reorder within a section.'
    : 'Clear search and filters to reorder tasks.';
  document.querySelector('#board-footer-text').textContent = visible.length === 0
    ? 'No tasks match the current view.'
    : `Showing ${visible.length} of ${tasks.length} tasks.`;
}

function showToast(message, snapshot) {
  clearTimeout(toastTimer);
  undoSnapshot = snapshot;
  toastMessage.textContent = message;
  undoButton.hidden = !snapshot;
  toast.hidden = false;
  toastTimer = setTimeout(() => {
    toast.hidden = true;
    undoSnapshot = null;
  }, 5000);
}

function hideToast() {
  clearTimeout(toastTimer);
  toast.hidden = true;
  undoSnapshot = null;
}

function taskEditMarkup(task) {
  const categoryOptions = Object.entries(CATEGORIES).map(([value, label]) => (
    `<option value="${value}" ${task.category === value ? 'selected' : ''}>${label}</option>`
  )).join('');
  return `<div class="task-content edit-content">
    <form class="edit-form" data-edit-id="${escapeHtml(task.id)}">
      <div class="edit-fields">
        <label class="edit-title-field">Task title<input name="title" maxlength="100" value="${escapeHtml(task.title)}" required /></label>
        <label class="edit-notes-field">Details<textarea name="notes" rows="2" maxlength="240">${escapeHtml(task.notes)}</textarea></label>
        <label class="edit-date-field">Due date<input name="dueDate" type="date" value="${escapeHtml(task.dueDate)}" /></label>
        <label class="edit-priority-field">Priority<select name="priority">
          <option value="normal" ${task.priority === 'normal' ? 'selected' : ''}>Normal</option>
          <option value="high" ${task.priority === 'high' ? 'selected' : ''}>High</option>
          <option value="low" ${task.priority === 'low' ? 'selected' : ''}>Low</option>
        </select></label>
        <label class="edit-category-field">Category<select name="category">${categoryOptions}</select></label>
      </div>
      <div class="edit-actions"><button type="button" data-action="cancel-edit">Cancel</button><button class="save-edit" type="submit">Save changes</button></div>
    </form>
  </div>`;
}

function reorderTask(draggedId, targetId) {
  const draggedTask = tasks.find((task) => task.id === draggedId);
  const targetTask = tasks.find((task) => task.id === targetId);
  if (!draggedTask || !targetTask || getGroupKey(draggedTask) !== getGroupKey(targetTask)) return;

  const groupTasks = tasks
    .filter((task) => getGroupKey(task) === getGroupKey(draggedTask))
    .sort((first, second) => first.order - second.order || first.createdAt - second.createdAt);
  const fromIndex = groupTasks.findIndex((task) => task.id === draggedId);
  const toIndex = groupTasks.findIndex((task) => task.id === targetId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

  const [movingTask] = groupTasks.splice(fromIndex, 1);
  groupTasks.splice(toIndex, 0, movingTask);
  groupTasks.forEach((task, index) => { task.order = index; });
  saveTasks();
  render();
}

taskForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(taskForm);
  const title = String(formData.get('title') || '').trim();
  if (!title) {
    taskTitleInput.focus();
    return;
  }

  const newTask = normalizeTask({
    id: makeId(),
    title,
    notes: String(formData.get('notes') || '').trim(),
    dueDate: String(formData.get('dueDate') || ''),
    priority: String(formData.get('priority') || 'normal'),
    category: String(formData.get('category') || 'general'),
    completed: false,
    createdAt: Date.now(),
    order: 0,
  });
  const sameGroup = tasks.filter((task) => getGroupKey(task) === getGroupKey(newTask));
  newTask.order = sameGroup.reduce((maximum, task) => Math.max(maximum, task.order), -1) + 1;
  tasks.push(newTask);
  saveTasks();
  taskForm.reset();
  taskForm.querySelector('details').open = false;
  activeFilter = 'all';
  activeCategory = 'all';
  categoryFilter.value = 'all';
  searchTerm = '';
  searchInput.value = '';
  render();
  taskTitleInput.focus();
});

document.querySelectorAll('[data-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    render();
  });
});

categoryFilter.addEventListener('change', () => {
  activeCategory = categoryFilter.value;
  render();
});

searchInput.addEventListener('input', () => {
  searchTerm = searchInput.value;
  render();
});

taskList.addEventListener('click', (event) => {
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;
  const item = actionButton.closest('[data-task-id]');
  const task = tasks.find((candidate) => candidate.id === item?.dataset.taskId);
  if (!task) return;

  if (actionButton.dataset.action === 'toggle') {
    task.completed = !task.completed;
    task.order = tasks.filter((candidate) => getGroupKey(candidate) === getGroupKey(task)).length;
    saveTasks();
    render();
  }

  if (actionButton.dataset.action === 'edit') {
    item.innerHTML = taskEditMarkup(task);
    item.classList.add('editing');
    item.querySelector('input[name="title"]').focus();
  }

  if (actionButton.dataset.action === 'cancel-edit') render();

  if (actionButton.dataset.action === 'delete') {
    const originalIndex = tasks.findIndex((candidate) => candidate.id === task.id);
    tasks.splice(originalIndex, 1);
    saveTasks();
    render();
    showToast('Task removed', { kind: 'single', task, index: originalIndex });
  }
});

taskList.addEventListener('submit', (event) => {
  if (!event.target.matches('.edit-form')) return;
  event.preventDefault();
  const form = event.target;
  const task = tasks.find((candidate) => candidate.id === form.dataset.editId);
  const values = new FormData(form);
  const title = String(values.get('title') || '').trim();
  if (!task || !title) return;
  task.title = title;
  task.notes = String(values.get('notes') || '').trim();
  task.dueDate = isValidDate(String(values.get('dueDate') || '')) ? String(values.get('dueDate')) : '';
  task.priority = String(values.get('priority') || 'normal');
  task.category = Object.hasOwn(CATEGORIES, String(values.get('category') || 'general'))
    ? String(values.get('category') || 'general')
    : 'general';
  saveTasks();
  render();
});

taskList.addEventListener('pointerdown', (event) => {
  dragStartedFromHandle = Boolean(event.target.closest('.drag-handle'));
});

taskList.addEventListener('pointerup', () => {
  dragStartedFromHandle = false;
});

taskList.addEventListener('pointercancel', () => {
  dragStartedFromHandle = false;
});

taskList.addEventListener('dragstart', (event) => {
  const item = event.target.closest('.task-card');
  if (!item || !dragStartedFromHandle || !canReorderTasks()) {
    event.preventDefault();
    return;
  }
  dragStartedFromHandle = false;
  draggedTaskId = item.dataset.taskId;
  item.classList.add('is-dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', draggedTaskId);
});

taskList.addEventListener('dragover', (event) => {
  const target = event.target.closest('.task-card');
  const draggedTask = tasks.find((task) => task.id === draggedTaskId);
  const targetTask = tasks.find((task) => task.id === target?.dataset.taskId);
  if (!target || !draggedTask || !targetTask || getGroupKey(draggedTask) !== getGroupKey(targetTask)) return;
  event.preventDefault();
  target.classList.add('drop-target');
});

taskList.addEventListener('dragleave', (event) => {
  event.target.closest('.task-card')?.classList.remove('drop-target');
});

taskList.addEventListener('drop', (event) => {
  const target = event.target.closest('.task-card');
  if (!target || !draggedTaskId) return;
  event.preventDefault();
  reorderTask(draggedTaskId, target.dataset.taskId);
});

taskList.addEventListener('dragend', () => {
  dragStartedFromHandle = false;
  draggedTaskId = null;
  taskList.querySelectorAll('.is-dragging, .drop-target').forEach((item) => {
    item.classList.remove('is-dragging', 'drop-target');
  });
});

clearCompletedButton.addEventListener('click', () => {
  const removed = tasks.filter((task) => task.completed);
  if (!removed.length) return;
  tasks = tasks.filter((task) => !task.completed);
  saveTasks();
  render();
  showToast(`${removed.length} completed ${removed.length === 1 ? 'task' : 'tasks'} removed`, { kind: 'bulk', tasks: removed });
});

undoButton.addEventListener('click', () => {
  if (!undoSnapshot) return;
  if (undoSnapshot.kind === 'single') {
    tasks.splice(undoSnapshot.index, 0, undoSnapshot.task);
  } else {
    tasks.push(...undoSnapshot.tasks);
  }
  saveTasks();
  hideToast();
  render();
});

themeToggle.addEventListener('click', () => {
  const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  setTheme(nextTheme);
});

document.querySelector('#export-button').addEventListener('click', () => {
  const backup = {
    format: 'daymark-task-manager',
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `daymark-tasks-${localDateKey()}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Backup downloaded', null);
});

document.querySelector('#import-button').addEventListener('click', () => importFileInput.click());

importFileInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const incoming = Array.isArray(parsed) ? parsed : parsed?.tasks;
    if (!Array.isArray(incoming)) throw new Error('Invalid backup shape');

    const knownIds = new Set(tasks.map((task) => task.id));
    const importedCandidates = [];
    incoming.forEach((item, index) => {
      if (!item || typeof item.title !== 'string' || !item.title.trim()) return;
      const normalized = normalizeTask(item, index);
      if (knownIds.has(normalized.id)) return;
      knownIds.add(normalized.id);
      importedCandidates.push(normalized);
    });

    if (!importedCandidates.length) {
      showToast('No new tasks found in that backup', null);
    } else {
      const groupOrder = new Map(GROUPS.map((group, index) => [group, index]));
      importedCandidates.sort((first, second) => (
        groupOrder.get(getGroupKey(first)) - groupOrder.get(getGroupKey(second))
        || first.order - second.order
        || first.createdAt - second.createdAt
      ));
      const nextOrderByGroup = new Map();
      importedCandidates.forEach((task) => {
        const group = getGroupKey(task);
        if (!nextOrderByGroup.has(group)) {
          const existingTasks = tasks.filter((current) => getGroupKey(current) === group);
          const nextOrder = existingTasks.reduce((maximum, current) => Math.max(maximum, current.order), -1) + 1;
          nextOrderByGroup.set(group, nextOrder);
        }
        task.order = nextOrderByGroup.get(group);
        nextOrderByGroup.set(group, task.order + 1);
      });
      const imported = importedCandidates;
      tasks.push(...imported);
      saveTasks();
      activeFilter = 'all';
      activeCategory = 'all';
      categoryFilter.value = 'all';
      searchTerm = '';
      searchInput.value = '';
      render();
      showToast(`Imported ${imported.length} ${imported.length === 1 ? 'task' : 'tasks'}`, null);
    }
  } catch (error) {
    showToast('Could not import that JSON backup', null);
  } finally {
    importFileInput.value = '';
  }
});

document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    searchInput.focus();
  }
  if (event.key === 'Escape' && document.activeElement === searchInput) {
    searchInput.value = '';
    searchTerm = '';
    render();
    searchInput.blur();
  }
});

document.querySelector('#today-label').textContent = new Intl.DateTimeFormat(undefined, {
  weekday: 'short', month: 'short', day: 'numeric',
}).format(new Date());

setTheme(readPreferences().theme, false);
render();
