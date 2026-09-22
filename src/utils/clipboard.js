/* Copies a link to the clipboard and gives the button that triggered it
   brief inline feedback. Falls back to a prompt() (manual copy) when the
   Clipboard API isn't available, e.g. non-secure contexts. */
export async function copyLink(url, triggerBtn){
  const original = triggerBtn.textContent;
  try{
    await navigator.clipboard.writeText(url);
    triggerBtn.textContent = 'Link copied ✓';
  }catch(err){
    window.prompt('Copy this link:', url);
    triggerBtn.textContent = original;
    return;
  }
  setTimeout(()=>{ triggerBtn.textContent = original; }, 1800);
}
