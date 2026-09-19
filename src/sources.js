// Catalog of personal-development sources. `title` is the exact Wikiquote
// page title (verified to exist); `name` is what the UI shows.
// `starter: true` marks sources enabled on first launch.

// Topics group the sources. Selecting a topic enables all of its sources.
export const TOPICS = [
  { name: 'Stoicism', icon: '🏛️', blurb: 'Marcus Aurelius, Seneca, Epictetus — on what is in our control' },
  { name: 'Eastern wisdom', icon: '☯️', blurb: 'Taoism, Buddhism, Zen, Vedanta and Sufi poetry' },
  { name: 'Classical philosophy', icon: '🏺', blurb: 'Socrates, Aristotle, Epicurus — the good life, examined' },
  { name: 'Modern philosophy', icon: '💭', blurb: 'From Montaigne and Emerson to Camus and Taleb' },
  { name: 'Aphorists & essayists', icon: '✒️', blurb: 'Maxims, wit and short wisdom from great writers' },
  { name: 'Psychology', icon: '🧠', blurb: 'Meaning, growth and the inner life' },
  { name: 'Self-improvement', icon: '🌱', blurb: 'Habits, focus and effectiveness' },
  { name: 'Leaders & lives', icon: '🕊️', blurb: 'Courage and character from lives well lived' },
];
export const CUSTOM_TOPIC = { name: 'Custom', icon: '➕', blurb: 'Wikiquote pages you added' };

export const GROUPS = TOPICS.map((t) => t.name);

export const SOURCES = [
  // Stoicism
  { id: 'marcus-aurelius', title: 'Marcus Aurelius', name: 'Marcus Aurelius', group: 'Stoicism', blurb: 'Meditations', starter: true },
  { id: 'seneca', title: 'Seneca the Younger', name: 'Seneca', group: 'Stoicism', blurb: 'Letters to Lucilius, essays', starter: true },
  { id: 'epictetus', title: 'Epictetus', name: 'Epictetus', group: 'Stoicism', blurb: 'Enchiridion, Discourses', starter: true },
  { id: 'cicero', title: 'Cicero', name: 'Cicero', group: 'Stoicism', blurb: 'On Duties, On Old Age' },
  { id: 'plutarch', title: 'Plutarch', name: 'Plutarch', group: 'Stoicism', blurb: 'Moralia, Lives' },

  // Eastern wisdom
  { id: 'laozi', title: 'Laozi', name: 'Laozi', group: 'Eastern wisdom', blurb: 'Tao Te Ching', starter: true },
  { id: 'tao-te-ching', title: 'Tao Te Ching', name: 'Tao Te Ching', group: 'Eastern wisdom', blurb: 'The book itself, many translations' },
  { id: 'zhuangzi', title: 'Zhuangzi', name: 'Zhuangzi', group: 'Eastern wisdom', blurb: 'Taoist parables' },
  { id: 'confucius', title: 'Confucius', name: 'Confucius', group: 'Eastern wisdom', blurb: 'Analects' },
  { id: 'buddha', title: 'Gautama Buddha', name: 'The Buddha', group: 'Eastern wisdom', blurb: 'Sutras and sayings', starter: true },
  { id: 'dhammapada', title: 'Dhammapada', name: 'Dhammapada', group: 'Eastern wisdom', blurb: 'Buddhist verses' },
  { id: 'bhagavad-gita', title: 'Bhagavad Gita', name: 'Bhagavad Gita', group: 'Eastern wisdom', blurb: 'Hindu scripture' },
  { id: 'rumi', title: 'Rumi', name: 'Rumi', group: 'Eastern wisdom', blurb: 'Sufi poetry' },
  { id: 'gibran', title: 'Kahlil Gibran', name: 'Kahlil Gibran', group: 'Eastern wisdom', blurb: 'The Prophet' },
  { id: 'sun-tzu', title: 'Sun Tzu', name: 'Sun Tzu', group: 'Eastern wisdom', blurb: 'The Art of War' },
  { id: 'musashi', title: 'Miyamoto Musashi', name: 'Miyamoto Musashi', group: 'Eastern wisdom', blurb: 'The Book of Five Rings' },
  { id: 'thich-nhat-hanh', title: 'Thích Nhất Hạnh', name: 'Thích Nhất Hạnh', group: 'Eastern wisdom', blurb: 'Mindfulness' },
  { id: 'dalai-lama', title: 'Tenzin Gyatso, 14th Dalai Lama', name: 'Dalai Lama', group: 'Eastern wisdom', blurb: 'Compassion' },
  { id: 'shunryu-suzuki', title: 'Shunryu Suzuki', name: 'Shunryu Suzuki', group: 'Eastern wisdom', blurb: "Zen Mind, Beginner's Mind" },
  { id: 'ramana-maharshi', title: 'Ramana Maharshi', name: 'Ramana Maharshi', group: 'Eastern wisdom', blurb: 'Self-enquiry' },
  { id: 'vivekananda', title: 'Swami Vivekananda', name: 'Swami Vivekananda', group: 'Eastern wisdom', blurb: 'Vedanta' },
  { id: 'krishnamurti', title: 'Jiddu Krishnamurti', name: 'Jiddu Krishnamurti', group: 'Eastern wisdom', blurb: 'Freedom from the known' },
  { id: 'alan-watts', title: 'Alan Watts', name: 'Alan Watts', group: 'Eastern wisdom', blurb: 'Zen for the West' },
  { id: 'sadhguru', title: 'Sadhguru', name: 'Sadhguru', group: 'Eastern wisdom', blurb: 'Inner engineering' },
  { id: 'osho', title: 'Rajneesh', name: 'Osho', group: 'Eastern wisdom', blurb: 'Talks' },

  // Classical philosophy
  { id: 'socrates', title: 'Socrates', name: 'Socrates', group: 'Classical philosophy', blurb: 'via Plato and Xenophon' },
  { id: 'aristotle', title: 'Aristotle', name: 'Aristotle', group: 'Classical philosophy', blurb: 'Nicomachean Ethics' },
  { id: 'epicurus', title: 'Epicurus', name: 'Epicurus', group: 'Classical philosophy', blurb: 'Letter to Menoeceus' },

  // Modern philosophy
  { id: 'montaigne', title: 'Michel de Montaigne', name: 'Michel de Montaigne', group: 'Modern philosophy', blurb: 'Essays' },
  { id: 'pascal', title: 'Blaise Pascal', name: 'Blaise Pascal', group: 'Modern philosophy', blurb: 'Pensées' },
  { id: 'schopenhauer', title: 'Arthur Schopenhauer', name: 'Arthur Schopenhauer', group: 'Modern philosophy', blurb: 'The Wisdom of Life' },
  { id: 'nietzsche', title: 'Friedrich Nietzsche', name: 'Friedrich Nietzsche', group: 'Modern philosophy', blurb: 'Thus Spoke Zarathustra' },
  { id: 'kierkegaard', title: 'Søren Kierkegaard', name: 'Søren Kierkegaard', group: 'Modern philosophy', blurb: 'Either/Or' },
  { id: 'emerson', title: 'Ralph Waldo Emerson', name: 'Ralph Waldo Emerson', group: 'Modern philosophy', blurb: 'Self-Reliance', starter: true },
  { id: 'thoreau', title: 'Henry David Thoreau', name: 'Henry David Thoreau', group: 'Modern philosophy', blurb: 'Walden', starter: true },
  { id: 'william-james', title: 'William James', name: 'William James', group: 'Modern philosophy', blurb: 'Habit, will, pragmatism' },
  { id: 'camus', title: 'Albert Camus', name: 'Albert Camus', group: 'Modern philosophy', blurb: 'The Myth of Sisyphus' },
  { id: 'russell', title: 'Bertrand Russell', name: 'Bertrand Russell', group: 'Modern philosophy', blurb: 'The Conquest of Happiness' },
  { id: 'taleb', title: 'Nassim Nicholas Taleb', name: 'Nassim Nicholas Taleb', group: 'Modern philosophy', blurb: 'The Bed of Procrustes' },

  // Aphorists & essayists
  { id: 'gracian', title: 'Baltasar Gracián', name: 'Baltasar Gracián', group: 'Aphorists & essayists', blurb: 'The Art of Worldly Wisdom' },
  { id: 'la-rochefoucauld', title: 'François de La Rochefoucauld', name: 'La Rochefoucauld', group: 'Aphorists & essayists', blurb: 'Maxims' },
  { id: 'franklin', title: 'Benjamin Franklin', name: 'Benjamin Franklin', group: 'Aphorists & essayists', blurb: "Poor Richard's Almanack" },
  { id: 'tolstoy', title: 'Leo Tolstoy', name: 'Leo Tolstoy', group: 'Aphorists & essayists', blurb: 'A Calendar of Wisdom' },
  { id: 'hesse', title: 'Hermann Hesse', name: 'Hermann Hesse', group: 'Aphorists & essayists', blurb: 'Siddhartha' },
  { id: 'dostoyevsky', title: 'Fyodor Dostoyevsky', name: 'Fyodor Dostoyevsky', group: 'Aphorists & essayists', blurb: 'Novels' },
  { id: 'twain', title: 'Mark Twain', name: 'Mark Twain', group: 'Aphorists & essayists', blurb: 'Wit' },
  { id: 'wilde', title: 'Oscar Wilde', name: 'Oscar Wilde', group: 'Aphorists & essayists', blurb: 'Wit' },
  { id: 'coelho', title: 'Paulo Coelho', name: 'Paulo Coelho', group: 'Aphorists & essayists', blurb: 'The Alchemist' },
  { id: 'maya-angelou', title: 'Maya Angelou', name: 'Maya Angelou', group: 'Aphorists & essayists', blurb: 'Poetry, memoir' },

  // Psychology
  { id: 'frankl', title: 'Viktor Frankl', name: 'Viktor Frankl', group: 'Psychology', blurb: "Man's Search for Meaning" },
  { id: 'jung', title: 'Carl Jung', name: 'Carl Jung', group: 'Psychology', blurb: 'Individuation' },
  { id: 'maslow', title: 'Abraham Maslow', name: 'Abraham Maslow', group: 'Psychology', blurb: 'Self-actualisation' },
  { id: 'fromm', title: 'Erich Fromm', name: 'Erich Fromm', group: 'Psychology', blurb: 'The Art of Loving' },
  { id: 'rogers', title: 'Carl Rogers', name: 'Carl Rogers', group: 'Psychology', blurb: 'On Becoming a Person' },
  { id: 'brene-brown', title: 'Brené Brown', name: 'Brené Brown', group: 'Psychology', blurb: 'Vulnerability' },

  // Self-improvement
  { id: 'carnegie', title: 'Dale Carnegie', name: 'Dale Carnegie', group: 'Self-improvement', blurb: 'How to Win Friends and Influence People' },
  { id: 'covey', title: 'Stephen Covey', name: 'Stephen Covey', group: 'Self-improvement', blurb: 'The 7 Habits' },
  { id: 'napoleon-hill', title: 'Napoleon Hill', name: 'Napoleon Hill', group: 'Self-improvement', blurb: 'Think and Grow Rich' },
  { id: 'zig-ziglar', title: 'Zig Ziglar', name: 'Zig Ziglar', group: 'Self-improvement', blurb: 'Motivation' },
  { id: 'tony-robbins', title: 'Anthony Robbins', name: 'Tony Robbins', group: 'Self-improvement', blurb: 'Awaken the Giant Within' },
  { id: 'eckhart-tolle', title: 'Eckhart Tolle', name: 'Eckhart Tolle', group: 'Self-improvement', blurb: 'The Power of Now' },
  { id: 'james-clear', title: 'James Clear', name: 'James Clear', group: 'Self-improvement', blurb: 'Atomic Habits' },
  { id: 'bruce-lee', title: 'Bruce Lee', name: 'Bruce Lee', group: 'Self-improvement', blurb: 'Striking Thoughts' },
  { id: 'drucker', title: 'Peter Drucker', name: 'Peter Drucker', group: 'Self-improvement', blurb: 'Effectiveness' },
  { id: 'buffett', title: 'Warren Buffett', name: 'Warren Buffett', group: 'Self-improvement', blurb: 'Patience, temperament' },
  { id: 'munger', title: 'Charlie Munger', name: 'Charlie Munger', group: 'Self-improvement', blurb: 'Mental models' },
  { id: 'steve-jobs', title: 'Steve Jobs', name: 'Steve Jobs', group: 'Self-improvement', blurb: 'Focus' },

  // Leaders & lives
  { id: 'einstein', title: 'Albert Einstein', name: 'Albert Einstein', group: 'Leaders & lives', blurb: 'Curiosity' },
  { id: 'churchill', title: 'Winston Churchill', name: 'Winston Churchill', group: 'Leaders & lives', blurb: 'Perseverance' },
  { id: 'theodore-roosevelt', title: 'Theodore Roosevelt', name: 'Theodore Roosevelt', group: 'Leaders & lives', blurb: 'The man in the arena' },
  { id: 'lincoln', title: 'Abraham Lincoln', name: 'Abraham Lincoln', group: 'Leaders & lives', blurb: 'Character' },
  { id: 'eleanor-roosevelt', title: 'Eleanor Roosevelt', name: 'Eleanor Roosevelt', group: 'Leaders & lives', blurb: 'Courage' },
  { id: 'mandela', title: 'Nelson Mandela', name: 'Nelson Mandela', group: 'Leaders & lives', blurb: 'Resilience' },
  { id: 'gandhi', title: 'Mahatma Gandhi', name: 'Mahatma Gandhi', group: 'Leaders & lives', blurb: 'Non-violence' },
  { id: 'mlk', title: 'Martin Luther King Jr.', name: 'Martin Luther King Jr.', group: 'Leaders & lives', blurb: 'Justice, hope' },
  { id: 'helen-keller', title: 'Helen Keller', name: 'Helen Keller', group: 'Leaders & lives', blurb: 'Optimism' },
  { id: 'anne-frank', title: 'Anne Frank', name: 'Anne Frank', group: 'Leaders & lives', blurb: 'Diary' },
  { id: 'booker-t-washington', title: 'Booker T. Washington', name: 'Booker T. Washington', group: 'Leaders & lives', blurb: 'Up from Slavery' },
  { id: 'frederick-douglass', title: 'Frederick Douglass', name: 'Frederick Douglass', group: 'Leaders & lives', blurb: 'Self-made men' },
];

export const STARTER_IDS = SOURCES.filter((s) => s.starter).map((s) => s.id);

export function sourceById(id) {
  return SOURCES.find((s) => s.id === id);
}

/** Build a source entry for a user-supplied Wikiquote page title. */
export function customSource(title) {
  const clean = title.trim().replace(/_/g, ' ');
  return { id: 'custom:' + clean.toLowerCase().replace(/[^a-z0-9]+/g, '-'), title: clean, name: clean, group: 'Custom', blurb: 'Wikiquote page', custom: true };
}
