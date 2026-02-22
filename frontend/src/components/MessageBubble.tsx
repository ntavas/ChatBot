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
 * Renders one chat message. User messages are right-aligned with an indigo bubble;
 * bot messages are left-aligned with a gray bubble and a robot avatar.
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
        <div className="max-w-[75%] bg-indigo-600 text-white px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm leading-relaxed whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2.5 mb-4">
      {/* Bot avatar */}
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-900 flex items-center justify-center text-sm mt-0.5">
        🤖
      </div>

      <div className="flex flex-col max-w-[85%]">
        <div className="bg-gray-800 text-gray-100 px-4 py-2.5 rounded-2xl rounded-tl-sm text-sm leading-relaxed whitespace-pre-wrap break-words">
          {message.content}
        </div>
        <FeedbackButtons messageId={message.id} sessionId={sessionId} onError={onError} />
      </div>
    </div>
  )
}
