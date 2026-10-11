export function supportsSpeechOutput(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function cleanTextForSpeech(markdown: string): string {
  return markdown.slice(0, 12000)
    .replace(/```[\s\S]*?```/g, ' Code block. ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/https?:\/\/\S+/g, 'link')
    .trim();
}

export function speakText(
  text: string,
  handlers: { onStart?: () => void; onEnd?: () => void; onError?: () => void } = {},
): boolean {
  if (!supportsSpeechOutput()) return false;
  const spokenText = cleanTextForSpeech(text);
  if (!spokenText) return false;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(spokenText);
  utterance.lang = navigator.language || 'en-US';
  utterance.onstart = () => handlers.onStart?.();
  utterance.onend = () => handlers.onEnd?.();
  utterance.onerror = () => handlers.onError?.();
  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopSpeaking(): void {
  if (supportsSpeechOutput()) window.speechSynthesis.cancel();
}
