// Client voice (UI-SPEC Copywriting Contract): "agent", no exclamation marks, what happened + what to do.
export const uploadCopy = {
  control: 'Take photo or choose files',
  controlAgain: 'Upload again',
  chooseFiles: 'Choose from files',
  done: 'Done with this item',
  intro: 'Take a photo of each page or choose files from your phone.',
  preparing: 'Preparing…',
  uploading: 'Uploading…',
  checking: 'Checking…',
  ready: 'Sent to your agent',
  needsNewCopy: 'Needs a new copy',
  approved: 'Your agent approved this.',
  rejectedPrefix: 'Your agent asked for a new copy: ',
  retry: 'Try again',
  remove: 'Remove',
} as const

const ERRORS: Record<string, string> = {
  unsupported_type: 'We can take PDFs and photos (JPG, PNG, HEIC).',
  file_too_large:
    'That file is too big (over 25 MB). Try a smaller scan or photo.',
  empty: 'That file is empty. Try again.',
  too_many_files: 'You can add up to 10 files for this item.',
  bad_file_type: 'That file is not a PDF or photo. Try again.',
  upload_incomplete: "We didn't get the whole file. Try again.",
  item_approved: 'Your agent already approved this item.',
  heic_failed: "We couldn't read that photo. Try a JPG or PDF.",
  network: 'Your connection dropped. Check your signal and try again.',
}

// Clients never see an error code (UI-SPEC Error convention).
export function errorCopy(code: string): string {
  return Object.prototype.hasOwnProperty.call(ERRORS, code)
    ? ERRORS[code]
    : 'Something went wrong. Try again.'
}
