export default function MessageBubble({ role, text }: { role: 'user' | 'assistant'; text: string }) {
  return (
    <div className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${role === 'user' ? 'ml-auto bg-[#990000] text-white' : 'bg-gray-100'}`}>
      {text}
    </div>
  )
}
