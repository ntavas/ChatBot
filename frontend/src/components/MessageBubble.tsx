// MessageBubble.tsx
// Renders a single chat message, styled differently for user vs bot.
// Bot messages include feedback buttons below the bubble.

import type { DisplayMessage } from '../types'
import { FeedbackButtons } from './FeedbackButtons'

interface MessageBubbleProps {
  message: DisplayMessage
  sessionId: string
  onError: (message: string) => void
}

/**
 * Renders one chat message. User messages are right-aligned with an indigo/blue bubble;
 * bot messages are left-aligned with a white/zinc bubble and the support bot avatar.
 * FeedbackButtons are rendered below bot messages only.
 *
 * @param message - The message to display.
 * @param sessionId - Passed through to FeedbackButtons for feedback submission.
 * @param onError - Passed through to FeedbackButtons for error display.
 */
export function MessageBubble({ message, sessionId, onError }: MessageBubbleProps) {
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
        <FeedbackButtons messageId={message.id} sessionId={sessionId} onError={onError} />
      </div>
    </div>
  )
}
