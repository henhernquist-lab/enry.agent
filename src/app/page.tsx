'use client';

import { useChat } from 'ai/react';
import { Search, Send, User, Bot, Globe } from 'lucide-react';
import { useEffect, useRef } from 'react';

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="flex flex-col h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">enry.agent</h1>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
            <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center">
              <Search className="w-8 h-8 text-zinc-400" />
            </div>
            <h2 className="text-2xl font-semibold text-zinc-800 dark:text-zinc-200">How can I help you today?</h2>
            <p className="text-zinc-500 dark:text-zinc-400 max-w-md">
              I can search the web for current information, answer questions, and more.
            </p>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`flex gap-3 max-w-[85%] ${
                m.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  m.role === 'user'
                    ? 'bg-zinc-200 dark:bg-zinc-800'
                    : 'bg-blue-100 dark:bg-blue-900/30'
                }`}
              >
                {m.role === 'user' ? (
                  <User className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
                ) : (
                  <Bot className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                )}
              </div>
              <div className="space-y-2">
                <div
                  className={`px-4 py-2 rounded-2xl ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200'
                  }`}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                </div>

                {/* Tool Invocations / Sources */}
                {m.toolInvocations?.map((toolInvocation) => {
                  const { toolName, toolCallId, state } = toolInvocation;

                  if (toolName === 'web_search') {
                    if (state === 'call') {
                      return (
                        <div key={toolCallId} className="flex items-center gap-2 text-sm text-zinc-500 animate-pulse">
                          <Globe className="w-4 h-4" />
                          <span>Searching the web...</span>
                        </div>
                      );
                    }

                    if (state === 'result') {
                      const { result } = toolInvocation;
                      return (
                        <div key={toolCallId} className="space-y-2">
                          <div className="flex items-center gap-2 text-sm font-medium text-zinc-500">
                            <Globe className="w-4 h-4" />
                            <span>Sources</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {result.sources?.map((source: any, idx: number) => (
                              <a
                                key={idx}
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                              >
                                <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                                  {source.title}
                                </div>
                                <div className="text-[10px] text-zinc-500 truncate">{source.url}</div>
                              </a>
                            ))}
                          </div>
                        </div>
                      );
                    }
                  }
                  return null;
                })}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 md:p-6 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto relative">
          <input
            className="w-full pl-4 pr-12 py-3 bg-zinc-100 dark:bg-zinc-800 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-zinc-900 dark:text-zinc-100"
            value={input}
            placeholder="Ask anything..."
            onChange={handleInputChange}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 disabled:bg-zinc-400 transition-all hover:bg-blue-700"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
        <p className="text-center text-[10px] text-zinc-400 mt-4">
          enry.agent can make mistakes. Check important info.
        </p>
      </div>
    </div>
  );
}
