// Reading statuses: the one place their names live. Every menu, filter,
// badge and panel reads from here so a status is called the same thing
// everywhere.

export const STATUS_LABELS = {
  to_read: 'To Read',
  reading: 'Reading',
  completed: 'Completed',
  on_hold: 'On Hold',
  dnf: 'DNF',
  author_abandoned: 'Author Abandoned',
};

export const STATUSES = Object.keys(STATUS_LABELS);

// A fic with no status yet counts as To Read, as it does everywhere else.
export const statusLabel = st => (st ? STATUS_LABELS[st] || st : STATUS_LABELS.to_read);
