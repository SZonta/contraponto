import { describe, expect, it } from 'vitest';
import { blenderInstructions, workFilesNote } from './instructions';

describe('Blender instructions', () => {
  it('provides quoted paths outside the worktree and an inline image recipe', () => {
    const note = blenderInstructions('C:\\Program Files\\Contraponto\\resources\\blender\\render_preview.py', 'C:\\Users\\Owner\\AppData\\Roaming\\Contraponto\\previews');
    expect(note).toContain("--python 'C:\\Program Files\\Contraponto\\resources\\blender\\render_preview.py'");
    expect(note).toContain('AppData\\Roaming\\Contraponto\\previews');
    expect(note).toContain('![Preview]');
    expect(note).toContain('fora do projeto e do Git');
  });
});

describe('work files note', () => {
  it('sends temporary work to the chat folder that goes away with the chat', () => {
    const note = workFilesNote('C:\Data\chat-files\abc\tmp');
    expect(note).toContain('C:\Data\chat-files\abc\tmp');
    expect(note).toContain('apagada junto com o chat');
  });
});
