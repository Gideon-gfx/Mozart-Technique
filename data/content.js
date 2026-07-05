// Admin/teacher-editable course content (video + lesson text), stored
// separately from the read-only catalog in data/courses.js so instructors
// can update what's taught without touching code.
const fs = require('fs');
const path = require('path');
const { getLessons: getDefaultLessons } = require('./courses');

const DATA_FILE = path.join(__dirname, 'course-content.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function getContent(courseId) {
  const db = load();
  return db[courseId] || null;
}

// A lesson plays from an uploaded file (videoUrl) if one is set, otherwise
// falls back to the YouTube embed (videoId).
function setContent(courseId, { lessons }) {
  const db = load();
  db[courseId] = {
    lessons: lessons.map((lesson, index) => ({
      index,
      title: lesson.title || `Lesson ${index + 1}`,
      videoId: lesson.videoId || 'dQw4w9WgXcQ',
      videoUrl: lesson.videoUrl || '',
      text: lesson.text || '',
    })),
    updatedAt: new Date().toISOString(),
  };
  persist(db);
  return db[courseId];
}

// Returns admin-authored lessons if they exist, otherwise the generic
// placeholder outline from data/courses.js.
function getEffectiveLessons(courseId) {
  const override = getContent(courseId);
  if (override) return override.lessons;
  return getDefaultLessons(courseId);
}

module.exports = { getContent, setContent, getEffectiveLessons };
