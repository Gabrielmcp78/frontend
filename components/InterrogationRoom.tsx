'use client';

import React, { useEffect, useState } from 'react';

interface Message {
  role: 'user' | 'model';
  content: string;
  contextLabel?: string | null;
  sourceRequest?: string;
  messageId?: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000';

interface PersonaOption {
  persona_id: string;
  name: string;
  category: string;
}

interface ManuscriptIndexEntry {
  scene_number: number;
  chapter_number: number | null;
  chapter_title: string | null;
  scene_number_in_chapter: number | null;
  title: string;
  word_count: number;
}

interface ConversationPayload {
  conversation_id: string;
  messages: Array<{
    message_id: number;
    role: 'user' | 'model';
    content: string;
    context_label?: string | null;
    source_request?: string | null;
  }>;
}

interface ConversationSummary {
  conversation_id: string;
  agent_id: string;
  updated_at: string;
  last_context_label?: string | null;
  message_count: number;
}

export default function InterrogationRoom({
  projectId,
  sceneNumber,
  currentSceneText,
  onProposalsStaged,
}: {
  projectId: string | null;
  sceneNumber: number | null;
  currentSceneText: string;
  onProposalsStaged?: () => void;
}) {
  const [targetPersona, setTargetPersona] = useState('narrative_editor');
  const [selectedProvider, setSelectedProvider] = useState('auto');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputVal, setInputVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const [manuscriptIndex, setManuscriptIndex] = useState<ManuscriptIndexEntry[]>([]);
  const [targetContext, setTargetContext] = useState('');
  const [stagingMessage, setStagingMessage] = useState<number | null>(null);
  const [proposalStatus, setProposalStatus] = useState<string | null>(null);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversationArchive, setConversationArchive] = useState<ConversationSummary[]>([]);
  const [conversationPopupOpen, setConversationPopupOpen] = useState(false);
  const contextLoading = Boolean(projectId) && manuscriptIndex.length === 0;

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/projects/${projectId}/personas`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Persona service returned ${res.status}.`);
        return (await res.json()) as PersonaOption[];
      })
      .then((data) => {
        if (!cancelled) {
          setPersonas(data);
          if (data[0]) setTargetPersona(data[0].persona_id);
        }
      })
      .catch((error) => {
        console.error('Persona roster error:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/projects/${projectId}/agent-conversations/roleplay`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Conversation archive returned ${res.status}.`);
        return (await res.json()) as { conversations?: ConversationSummary[] };
      })
      .then((data) => {
        if (!cancelled) setConversationArchive(data.conversations ?? []);
      })
      .catch((error) => console.error('Roleplay conversation archive error:', error));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !targetPersona) {
      return;
    }
    let cancelled = false;
    fetch(`${API_BASE}/api/projects/${projectId}/agent-conversations/roleplay/${encodeURIComponent(targetPersona)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Conversation service returned ${res.status}.`);
        return (await res.json()) as ConversationPayload;
      })
      .then((data) => {
        if (cancelled) return;
        setMessages(
          (data.messages ?? []).map((message) => ({
            role: message.role,
            content: message.content,
            contextLabel: message.context_label,
            sourceRequest: message.source_request ?? undefined,
            messageId: message.message_id,
          })),
        );
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('Roleplay conversation error:', error);
          setErrorMessage('Unable to load this agent’s saved conversation.');
          setMessages([]);
        }
      })
      .finally(() => {
        if (!cancelled) setConversationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, targetPersona]);

  useEffect(() => {
    if (!projectId) {
      return;
    }
    let cancelled = false;
    fetch(`${API_BASE}/api/projects/${projectId}/manuscript/index`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Manuscript index returned ${res.status}.`);
        return (await res.json()) as { scenes: ManuscriptIndexEntry[] };
      })
      .then((data) => {
        if (!cancelled) {
          setManuscriptIndex(data.scenes ?? []);
          setTargetContext('');
        }
      })
      .catch((error) => {
        console.error('Manuscript context error:', error);
      })
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const handleSendMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inputVal.trim() || loading) return;
    if (!projectId || sceneNumber === null) return;

    const userMsg: Message = { role: 'user', content: inputVal.trim() };
    const updatedHistory = [...messages, userMsg];
    setMessages(updatedHistory);
    setInputVal('');
    setErrorMessage(null);
    setLoading(true);

    try {
      const isChapterTarget = targetContext.startsWith('chapter:');
      const isSceneTarget = targetContext.startsWith('scene:');
      const selectedChapterNumber = isChapterTarget
        ? Number(targetContext.slice('chapter:'.length))
        : null;
      const selectedTarget = manuscriptIndex.find(
        (scene) => `scene:${scene.scene_number}` === targetContext,
      );
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/interrogation/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persona_id: targetPersona,
          scene_number: sceneNumber,
          conversation_channel: 'roleplay',
          conversation_history: updatedHistory.slice(0, -1),
          user_message: userMsg.content,
          current_screen_text: currentSceneText,
          target_scope: isChapterTarget ? 'chapter' : isSceneTarget ? 'scene' : 'screen',
          target_chapter_number: selectedChapterNumber ?? selectedTarget?.chapter_number ?? null,
          target_scene_number_in_chapter: isChapterTarget
            ? null
            : selectedTarget?.scene_number_in_chapter ?? null,
          target_global_scene_number: isChapterTarget ? null : selectedTarget?.scene_number ?? null,
          preferred_provider: selectedProvider !== 'auto' ? selectedProvider : undefined,
        }),
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        throw new Error(errorBody?.detail ?? 'Chat request failed.');
      }

      const data = await res.json();
      const targetLabel = data.context?.target_label ?? null;
      setMessages([
        ...updatedHistory,
        {
          role: 'model',
          content: data.response_message,
          sourceRequest: userMsg.content,
          messageId: data.message_id,
          contextLabel: data.context?.context_label ?? (targetLabel
            ? `Context: on screen + ${targetLabel}`
            : 'Context: current editor screen'),
        },
      ]);
      fetch(`${API_BASE}/api/projects/${projectId}/agent-conversations/roleplay`)
        .then((archiveRes) => archiveRes.json())
        .then((archiveData: { conversations?: ConversationSummary[] }) => setConversationArchive(archiveData.conversations ?? []))
        .catch((archiveError) => console.error('Roleplay archive refresh error:', archiveError));
    } catch (error) {
      console.error('Chat error:', error);
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to reach the interrogation service.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleStageProposals = async (message: Message, messageIndex: number) => {
    if (!projectId || !message.sourceRequest || stagingMessage !== null) return;
    setStagingMessage(messageIndex);
    setProposalStatus(null);
    setProposalError(null);
    try {
      const isChapterTarget = targetContext.startsWith('chapter:');
      const isSceneTarget = targetContext.startsWith('scene:');
      const targetNumber = Number(targetContext.split(':')[1]);
      const selectedTarget = manuscriptIndex.find(
        (scene) => `scene:${scene.scene_number}` === targetContext,
      );
      const requestText = [
        'Convert the following author request and profile response into exact, source-anchored editorial proposals.',
        'Do not apply changes. Stage only proposals that can be verified against the selected manuscript scope; put uncertain guidance in questions.',
        '',
        'AUTHOR REQUEST:',
        message.sourceRequest,
        '',
        'PROFILE RESPONSE:',
        message.content,
      ].join('\n');
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/approval-batches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_text: requestText,
          chapter_numbers: isChapterTarget ? [targetNumber] : [],
          scene_numbers: isSceneTarget && selectedTarget
            ? [selectedTarget.scene_number]
            : !isChapterTarget && sceneNumber !== null
              ? [sceneNumber]
              : [],
          include: ['plot', 'causality', 'character', 'subtext'],
          persona_ids: [targetPersona],
        }),
      });
      const data = await res.json().catch(() => null) as {
        proposals?: Array<{ status?: string }>;
        questions?: string[];
        rejected?: Array<unknown>;
        detail?: string;
      } | null;
      if (!res.ok) throw new Error(data?.detail ?? `Approval preparation returned ${res.status}.`);
      const staged = data?.proposals?.filter((proposal) => proposal.status === 'staged').length ?? 0;
      const rejected = data?.rejected?.length ?? 0;
      const questions = data?.questions?.length ?? 0;
      setProposalStatus(`Staged ${staged} proposal${staged === 1 ? '' : 's'} in Staged Diffs${rejected || questions ? ` · ${rejected} rejected · ${questions} question${questions === 1 ? '' : 's'}` : ''}.`);
      onProposalsStaged?.();
    } catch (error) {
      setProposalError(error instanceof Error ? error.message : 'Unable to stage proposals.');
    } finally {
      setStagingMessage(null);
    }
  };

  const handleTargetChange = (personaId: string) => {
    setTargetPersona(personaId);
    setErrorMessage(null);
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 rounded-lg overflow-hidden border border-slate-800">
      <div className="p-3 bg-slate-900 border-b border-slate-800 flex justify-between items-center text-xs">
        <div className="min-w-0">
          <div className="font-semibold text-slate-300">Interrogation Room · Profile simulation</div>
          <div className="mt-1 text-[10px] text-emerald-400">
            {conversationLoading
              ? 'Loading this agent’s saved conversation...'
              : contextLoading
              ? 'Indexing project manuscript...'
              : `Manuscript context: ${manuscriptIndex.length} scenes · conversation saved per agent`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedProvider}
            onChange={(event) => setSelectedProvider(event.target.value)}
            className="bg-slate-800 text-slate-300 border border-slate-700 rounded px-2 py-1 text-[11px] outline-none"
            aria-label="AI Engine Provider"
            title="Provider engine (Auto fallback, OpenRouter, Ollama, AGY, Apple FM, Gemini)"
          >
            <option value="auto">Auto Engine (OpenRouter/Gemini/Ollama/AGY)</option>
            <option value="openrouter">OpenRouter</option>
            <option value="ollama">Ollama (120B Cloud)</option>
            <option value="agy">AGY CLI</option>
            <option value="fmodcli">Apple Foundation Models</option>
            <option value="gemini">Gemini</option>
          </select>
          <select
            value={targetPersona}
            onChange={(event) => handleTargetChange(event.target.value)}
            className="bg-slate-800 text-slate-200 border border-slate-700 rounded px-2 py-1 text-xs outline-none"
            aria-label="Interrogation target"
          >
            {personas.length > 0 ? personas.map((persona) => (
              <option key={persona.persona_id} value={persona.persona_id}>
                {persona.name} · {persona.category.replaceAll('_', ' ')}
              </option>
            )) : (
              <option value="narrative_editor">Narrative editor</option>
            )}
          </select>
          <button
            type="button"
            onClick={() => setConversationPopupOpen(true)}
            className="rounded border border-emerald-700/60 bg-emerald-950/30 px-2 py-1 text-[10px] text-emerald-200 transition hover:bg-emerald-900/40"
          >
            View saved
          </button>
        </div>
      </div>

      {conversationArchive.length > 0 && (
        <div className="border-b border-slate-800 bg-slate-950/80 px-3 py-2">
          <label className="block text-[10px] uppercase tracking-wide text-slate-500" htmlFor="saved-roleplay-thread">
            Saved agent conversations
          </label>
          <select
            id="saved-roleplay-thread"
            defaultValue=""
            onChange={(event) => {
              const summary = conversationArchive.find((item) => item.conversation_id === event.target.value);
              if (summary) {
                setTargetPersona(summary.agent_id);
                setConversationPopupOpen(true);
              }
            }}
            className="mt-1 w-full rounded border border-slate-800 bg-slate-900 px-2 py-1.5 text-[10px] text-slate-300 outline-none focus:border-emerald-500"
          >
            <option value="">Open a saved roleplay thread…</option>
            {conversationArchive.map((summary) => {
              const persona = personas.find((item) => item.persona_id === summary.agent_id);
              return (
                <option key={summary.conversation_id} value={summary.conversation_id}>
                  {new Date(summary.updated_at).toLocaleString()} · {persona?.name ?? summary.agent_id} · {summary.last_context_label ?? 'current screen'} · {summary.message_count} messages
                </option>
              );
            })}
          </select>
        </div>
      )}

      <div className="border-b border-slate-800 bg-slate-950/80 px-3 py-2 space-y-1">
        <label className="block text-[10px] uppercase tracking-wide text-slate-500" htmlFor="interrogation-context-target">
          Full Manuscript Context & Target Scope
        </label>
        <select
          id="interrogation-context-target"
          value={targetContext}
          onChange={(event) => setTargetContext(event.target.value)}
          className="w-full bg-slate-900 text-slate-300 border border-slate-800 rounded px-2 py-1.5 text-xs outline-none focus:border-indigo-500"
        >
          <option value="">Current Chapter + Active Scene Focus (Recommended)</option>
          <optgroup label="Full chapters">
            {manuscriptIndex
              .filter((scene, index, allScenes) =>
                scene.chapter_number !== null
                && allScenes.findIndex((candidate) => candidate.chapter_number === scene.chapter_number) === index,
              )
              .map((scene) => (
                <option key={`chapter-${scene.chapter_number}`} value={`chapter:${scene.chapter_number}`}>
                  Chapter {scene.chapter_number} · {scene.chapter_title ?? `Chapter ${scene.chapter_number}`}
                </option>
              ))}
          </optgroup>
          <optgroup label="Individual scenes">
            {manuscriptIndex.map((scene) => {
              const location = scene.chapter_number !== null && scene.scene_number_in_chapter !== null
                ? `Chapter ${scene.chapter_number}, Scene ${scene.scene_number_in_chapter}`
                : `Scene ${scene.scene_number}`;
              return (
                <option key={scene.scene_number} value={`scene:${scene.scene_number}`}>
                  {location} · {scene.title}
                </option>
              );
            })}
          </optgroup>
        </select>
        <p className="text-[10px] leading-relaxed text-slate-500">
          The room always receives the actual editor contents. Choose a full chapter, choose a scene, or write “Chapter 1” / “Chapter 1, Scene 1” in your message.
        </p>
      </div>

      <div className="flex-1 p-4 overflow-y-auto space-y-3 text-xs">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[85%] p-3 rounded-lg leading-relaxed ${message.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-200 border border-slate-800 font-serif text-sm'}`}
            >
              {message.content}
            </div>
            <span className="text-[10px] text-slate-500 mt-1">
              {message.role === 'user' ? 'You' : targetPersona.split('_').slice(1).join(' ').toUpperCase()}
            </span>
            {message.contextLabel && (
              <span className="text-[10px] text-indigo-400/80 mt-0.5">{message.contextLabel}</span>
            )}
            {message.role === 'model' && message.sourceRequest && (
              <button
                type="button"
                disabled={stagingMessage !== null}
                onClick={() => void handleStageProposals(message, index)}
                className="mt-2 rounded border border-amber-500/40 bg-amber-950/30 px-2 py-1 text-[10px] font-medium text-amber-200 transition hover:bg-amber-900/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {stagingMessage === index ? 'Preparing proposals…' : 'Stage as proposals'}
              </button>
            )}
          </div>
        ))}
        {loading && <div className="text-slate-500 italic text-xs animate-pulse">Thinking...</div>}
        {errorMessage && (
          <div className="rounded border border-rose-800/60 bg-rose-950/30 p-2 text-xs text-rose-200">
            {errorMessage}
          </div>
        )}
        {proposalStatus && (
          <div className="rounded border border-emerald-800/60 bg-emerald-950/30 p-2 text-xs text-emerald-200">
            {proposalStatus}
          </div>
        )}
        {proposalError && (
          <div className="rounded border border-rose-800/60 bg-rose-950/30 p-2 text-xs text-rose-200">
            {proposalError}
          </div>
        )}
      </div>

      <form onSubmit={handleSendMessage} className="p-3 bg-slate-900 border-t border-slate-800 flex space-x-2">
        <input
          type="text"
          value={inputVal}
          onChange={(event) => setInputVal(event.target.value)}
          placeholder="Ask about the screen, or say “Chapter 1, Scene 1”..."
          className="flex-1 bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          aria-label="Interrogation message"
        />
        <button
          type="submit"
          disabled={loading || !inputVal.trim()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 disabled:cursor-not-allowed text-white rounded text-xs font-medium transition"
        >
          {loading ? 'Sending...' : 'Send'}
        </button>
      </form>

      {conversationPopupOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/85 p-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="saved-roleplay-title"
        >
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-lg border border-emerald-700/60 bg-slate-900 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 p-4">
              <div>
                <h2 id="saved-roleplay-title" className="text-sm font-semibold text-slate-100">
                  Saved roleplay conversation · {personas.find((persona) => persona.persona_id === targetPersona)?.name ?? targetPersona}
                </h2>
                <p className="mt-1 text-[10px] text-slate-400">
                  Project-scoped transcript · {messages.length} messages · target context is recorded with each reply
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConversationPopupOpen(false)}
                className="px-2 py-1 text-xs text-slate-400 hover:text-slate-100"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 space-y-3 overflow-y-auto p-5">
              {conversationLoading ? (
                <p className="text-xs text-slate-500">Loading transcript…</p>
              ) : messages.length === 0 ? (
                <p className="text-xs text-slate-500">No messages have been saved for this agent yet.</p>
              ) : (
                messages.map((message, index) => (
                  <div key={message.messageId ?? `saved-roleplay-${index}`} className={message.role === 'user' ? 'text-right' : 'text-left'}>
                    <div className={`inline-block max-w-[95%] rounded p-3 text-xs leading-relaxed ${message.role === 'user' ? 'bg-indigo-900/60 text-indigo-100' : 'bg-slate-950 text-slate-200'}`}>
                      <div className="mb-1 text-[9px] uppercase tracking-wide text-slate-500">{message.role === 'user' ? 'You' : 'Agent'}</div>
                      <div className="whitespace-pre-wrap">{message.content}</div>
                    </div>
                    {message.contextLabel && <div className="mt-1 text-[9px] text-emerald-400/70">{message.contextLabel}</div>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
