// MessageBubble.tsx
// Αποδίδει ένα μεμονωμένο μήνυμα συνομιλίας, με διαφορετικό στυλ για χρήστη και bot.
// Τα μηνύματα bot περιλαμβάνουν κουμπιά feedback κάτω από τη φούσκα.
// Το userQuestion (το προηγούμενο μήνυμα χρήστη) μεταβιβάζεται στα FeedbackButtons
// ώστε να αποθηκεύεται μαζί με το feedback για άμεση εμφάνιση στον admin.

import type { DisplayMessage } from '../types'
import { FeedbackButtons } from './FeedbackButtons'

interface MessageBubbleProps {
  message: DisplayMessage
  sessionId: string
  // Το ερώτημα του χρήστη που προηγήθηκε — null αν δεν υπάρχει προηγούμενο μήνυμα
  userQuestion?: string | null
  onError: (message: string) => void
}

/**
 * Αποδίδει ένα μήνυμα συνομιλίας. Τα μηνύματα χρηστών στοιχίζονται δεξιά·
 * τα μηνύματα bot στοιχίζονται αριστερά με avatar και κουμπιά feedback.
 *
 * @param message - Το μήνυμα προς εμφάνιση.
 * @param sessionId - Μεταβιβάζεται στα FeedbackButtons για υποβολή feedback.
 * @param userQuestion - Το ερώτημα του χρήστη πριν από αυτή την απάντηση (για αποθήκευση πλαισίου).
 * @param onError - Μεταβιβάζεται στα FeedbackButtons για εμφάνιση σφαλμάτων.
 */
export function MessageBubble({ message, sessionId, userQuestion, onError }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        {/* indigo in light mode, blue in dark — keeps purple out of the dark theme */}
        <div className="max-w-[75%] bg-indigo-600 dark:bg-blue-600 text-white px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm leading-relaxed whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2.5 mb-4">
      {/* Bot avatar — uses the support PNG instead of an emoji */}
      <div className="flex-shrink-0 w-7 h-7 rounded-full overflow-hidden mt-0.5">
        <img src="/technical-support.png" alt="Bot" className="w-full h-full object-cover" />
      </div>

      <div className="flex flex-col max-w-[85%]">
        <div className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 shadow-sm text-gray-800 dark:text-zinc-100 px-4 py-2.5 rounded-2xl rounded-tl-sm text-sm leading-relaxed whitespace-pre-wrap break-words">
          {message.content}
        </div>
        <FeedbackButtons
          messageId={message.id}
          sessionId={sessionId}
          userQuestion={userQuestion}
          botAnswer={message.content}
          onError={onError}
        />
      </div>
    </div>
  )
}
