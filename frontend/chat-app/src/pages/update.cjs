const fs = require('fs');
let c = fs.readFileSync('shared-chat.tsx', 'utf8');
const m = `  const handleMessageFeedback = useCallback(async (messageId: string, type: 'LIKE' | 'DISLIKE') => {
    if (!project || !convId) return;
    try {
      await fetch(apiUrl('/api/widget/projects/' + project.id + '/messages/' + messageId + '/feedback'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: convId, type, channel: 'WEBSITE' })
      });
      toast({ title: 'Feedback received, thank you!' });
    } catch (e) {
      console.error(e);
    }
  }, [project, convId, toast]);\n\n`;

c = c.replace('<SharedMemoizedMessage key={msg.id} msg={msg} onCopy={copyToClipboard} />', '<SharedMemoizedMessage key={msg.id} msg={msg} onCopy={copyToClipboard} onFeedback={handleMessageFeedback} />');
c = c.replace('  const startNewChat =', m + '  const startNewChat =');
fs.writeFileSync('shared-chat.tsx', c);
