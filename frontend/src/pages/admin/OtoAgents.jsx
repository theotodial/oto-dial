import { useCallback, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import API from '../../api';

const sections = [
  'Dashboard',
  'Agents',
  'Tasks',
  'Reports',
  'Workflows',
  'Social Accounts',
  'AI Assets',
  'Research Hub',
  'Activity Timeline',
  'Prompt Library',
  'Settings',
];

const modeStyles = {
  manual: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  copilot: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200',
  autopilot: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
};

function StatCard({ label, value, detail }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-sm backdrop-blur">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400" />
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-400">{detail}</p>
    </div>
  );
}

function AgentCard({ agent, onAction, onRun, onEdit, onDelete, onTest, executionDisabled }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-indigo-500">{String(agent.role || '').replaceAll('_', ' ')}</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-950 dark:text-white">{agent.name}</h3>
          <p className="mt-2 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{agent.description}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${modeStyles[agent.autonomyMode] || modeStyles.manual}`}>
          {agent.autonomyMode}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
          <p className="text-lg font-semibold text-slate-900 dark:text-white">{agent.performanceMetrics?.tasksCompleted || 0}</p>
          <p className="text-xs text-slate-500">Tasks</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
          <p className="text-lg font-semibold text-slate-900 dark:text-white">{agent.performanceMetrics?.approvalsPending || 0}</p>
          <p className="text-xs text-slate-500">Approvals</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
          <p className="text-lg font-semibold text-slate-900 dark:text-white">{agent.performanceMetrics?.contentGenerated || 0}</p>
          <p className="text-xs text-slate-500">Outputs</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button disabled={executionDisabled} onClick={() => onRun(agent)} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-950">
          Run Task
        </button>
        <button disabled={executionDisabled} onClick={() => onTest(agent)} className="rounded-xl border border-cyan-300 px-3 py-2 text-xs font-semibold text-cyan-700 disabled:opacity-50 dark:border-cyan-700 dark:text-cyan-300">
          Test Prompt
        </button>
        {agent.status === 'paused' ? (
          <button onClick={() => onAction(agent, 'resume')} className="rounded-xl border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-700 dark:border-emerald-700 dark:text-emerald-300">
            Resume
          </button>
        ) : (
          <button onClick={() => onAction(agent, 'pause')} className="rounded-xl border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-700 dark:border-amber-700 dark:text-amber-300">
            Pause
          </button>
        )}
        <button onClick={() => onAction(agent, agent.status === 'active' ? 'stop' : 'start')} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
          {agent.status === 'active' ? 'Stop' : 'Start'}
        </button>
        <button onClick={() => onEdit(agent)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
          Edit
        </button>
        <button onClick={() => onAction(agent, 'duplicate')} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
          Duplicate
        </button>
        <button onClick={() => onDelete(agent)} className="rounded-xl border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-800 dark:text-red-300">
          Delete
        </button>
      </div>
    </div>
  );
}

function Timeline({ logs = [] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Activity Timeline</h2>
      <div className="mt-4 space-y-4">
        {logs.slice(0, 10).map((log) => (
          <div key={log._id} className="flex gap-3">
            <div className="mt-1 h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-[0_0_0_4px_rgba(34,211,238,0.15)]" />
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">{String(log.event || '').replaceAll('_', ' ')}</p>
              <p className="text-xs text-slate-500">{log.agent?.name || 'System'} • {log.timestamp ? new Date(log.timestamp).toLocaleString() : 'now'}</p>
            </div>
          </div>
        ))}
        {!logs.length && <p className="text-sm text-slate-500">No AI operations recorded yet.</p>}
      </div>
    </div>
  );
}

function DataRows({ items = [], render, empty = 'No persisted records yet.' }) {
  return (
    <div className="mt-4 space-y-3">
      {items.map((item) => (
        <div key={item._id} className="rounded-xl bg-slate-50 p-3 text-sm text-slate-900 dark:bg-slate-950 dark:text-white">
          {render(item)}
        </div>
      ))}
      {!items.length && <p className="text-sm text-slate-500">{empty}</p>}
    </div>
  );
}

function DataList({ title, items = [], render }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{title}</h2>
      <DataRows items={items} render={render} />
    </div>
  );
}

const emptyAgentForm = {
  name: '',
  description: '',
  category: 'growth',
  avatarIcon: 'spark',
  colorTheme: 'indigo',
  role: 'custom',
  autonomyMode: 'manual',
  mission: '',
  responsibilities: '',
  goals: '',
  tone: '',
  behavior: '',
  executionStyle: 'careful, auditable, approval-aware',
  writingStyle: '',
  postingStyle: '',
  systemPrompt: '',
  imageGeneration: false,
  publishing: false,
};

function CreateAgentModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState(emptyAgentForm);
  const [saving, setSaving] = useState(false);
  if (!open) return null;

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const submit = async () => {
    setSaving(true);
    const res = await API.post('/api/admin/oto-agents/agents', {
      ...form,
      responsibilities: form.responsibilities.split('\n').map((s) => s.trim()).filter(Boolean),
      goals: form.goals.split('\n').map((s) => s.trim()).filter(Boolean),
      capabilities: {
        research: true,
        drafting: true,
        imageGeneration: form.imageGeneration,
        publishing: form.publishing,
        approvalsRequired: form.autonomyMode !== 'autopilot' || !form.publishing,
        maxAutopilotActionsPerDay: form.autonomyMode === 'autopilot' ? 3 : 0,
      },
    });
    setSaving(false);
    if (res.data?.success) {
      setForm(emptyAgentForm);
      onCreated();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/80 p-4 backdrop-blur">
      <div className="mx-auto my-8 max-w-6xl rounded-3xl border border-white/10 bg-white shadow-2xl dark:bg-slate-950">
        <div className="border-b border-slate-200 p-6 dark:border-slate-800">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-500">Create New AI Agent</p>
              <h2 className="mt-2 text-3xl font-semibold text-slate-950 dark:text-white">Design a custom AI employee</h2>
              <p className="mt-2 text-sm text-slate-500">Configure identity, mission, autonomy, prompt profile, execution rules, and publishing guardrails.</p>
            </div>
            <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm dark:border-slate-700 dark:text-white">Close</button>
          </div>
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-[360px_1fr]">
          <div className="space-y-4">
            <input className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" placeholder="Agent name" value={form.name} onChange={(e) => update('name', e.target.value)} />
            <textarea className="h-24 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" placeholder="Description" value={form.description} onChange={(e) => update('description', e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <select className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" value={form.role} onChange={(e) => update('role', e.target.value)}>
                {['custom','growth_seo','social_media','reputation_monitoring','customer_success','revenue_optimization','content_factory','competitive_intelligence','product_strategy'].map((r) => <option key={r} value={r}>{r.replaceAll('_', ' ')}</option>)}
              </select>
              <select className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" value={form.autonomyMode} onChange={(e) => update('autonomyMode', e.target.value)}>
                <option value="manual">Manual</option>
                <option value="copilot">Co-Pilot</option>
                <option value="autopilot">Autopilot</option>
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <input className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" placeholder="Category" value={form.category} onChange={(e) => update('category', e.target.value)} />
              <input className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" placeholder="Icon" value={form.avatarIcon} onChange={(e) => update('avatarIcon', e.target.value)} />
              <input className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" placeholder="Theme" value={form.colorTheme} onChange={(e) => update('colorTheme', e.target.value)} />
            </div>
            <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700 dark:text-white">
              <input type="checkbox" checked={form.imageGeneration} onChange={(e) => update('imageGeneration', e.target.checked)} />
              Enable branded AI image generation
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700 dark:text-white">
              <input type="checkbox" checked={form.publishing} onChange={(e) => update('publishing', e.target.checked)} />
              Allow publishing permission scope
            </label>
          </div>

          <div className="space-y-4">
            <textarea className="h-20 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" placeholder="Mission" value={form.mission} onChange={(e) => update('mission', e.target.value)} />
            <div className="grid gap-4 lg:grid-cols-2">
              <textarea className="h-28 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" placeholder="Responsibilities, one per line" value={form.responsibilities} onChange={(e) => update('responsibilities', e.target.value)} />
              <textarea className="h-28 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" placeholder="Goals, one per line" value={form.goals} onChange={(e) => update('goals', e.target.value)} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <input className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" placeholder="Tone" value={form.tone} onChange={(e) => update('tone', e.target.value)} />
              <input className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" placeholder="Writing style" value={form.writingStyle} onChange={(e) => update('writingStyle', e.target.value)} />
              <input className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" placeholder="Execution style" value={form.executionStyle} onChange={(e) => update('executionStyle', e.target.value)} />
              <input className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" placeholder="Posting style" value={form.postingStyle} onChange={(e) => update('postingStyle', e.target.value)} />
            </div>
            <textarea className="h-20 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" placeholder="Behavior rules and restrictions" value={form.behavior} onChange={(e) => update('behavior', e.target.value)} />
            <textarea className="h-72 w-full rounded-2xl border border-slate-200 bg-slate-950 px-5 py-4 font-mono text-sm text-cyan-50 outline-none ring-cyan-400/30 focus:ring-4" placeholder="Custom system prompt. Supports markdown, structured sections, research targets, workflow rules, and restrictions." value={form.systemPrompt} onChange={(e) => update('systemPrompt', e.target.value)} />
            <button disabled={saving || !form.name || !form.systemPrompt} onClick={submit} className="w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-lg disabled:opacity-50">
              {saving ? 'Creating Agent...' : 'Create AI Agent'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OtoAgents() {
  const [activeSection, setActiveSection] = useState('Dashboard');
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [manualPrompt, setManualPrompt] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [playgroundOutput, setPlaygroundOutput] = useState(null);
  const [sectionData, setSectionData] = useState({});
  const [actionError, setActionError] = useState('');

  const loadDashboard = useCallback(async () => {
    const res = await API.get('/api/admin/oto-agents/dashboard');
    if (res.data?.success) {
      setDashboard(res.data.dashboard);
      setError('');
    } else {
      setError(res.error || 'Failed to load OTO Agents');
    }
    setLoading(false);
  }, []);

  const loadSectionData = useCallback(async () => {
    const endpointBySection = {
      Tasks: '/api/admin/oto-agents/tasks',
      Reports: '/api/admin/oto-agents/reports',
      Workflows: '/api/admin/oto-agents/workflows',
      'Social Accounts': '/api/admin/oto-agents/social-accounts',
      'AI Assets': '/api/admin/oto-agents/assets',
      'Research Hub': '/api/admin/oto-agents/research',
      'Activity Timeline': '/api/admin/oto-agents/timeline',
      'Prompt Library': '/api/admin/oto-agents/prompts',
      Settings: '/api/admin/oto-agents/provider-status',
    };
    const endpoint = endpointBySection[activeSection];
    if (!endpoint) return;
    const res = await API.get(endpoint);
    if (res.data?.success) {
      setSectionData((prev) => ({ ...prev, [activeSection]: res.data }));
      setActionError('');
    } else {
      setActionError(res.error || `Failed to load ${activeSection}`);
    }
  }, [activeSection]);

  useEffect(() => {
    loadDashboard();
    const timer = setInterval(loadDashboard, 45000);
    return () => clearInterval(timer);
  }, [loadDashboard]);

  useEffect(() => {
    loadSectionData();
  }, [loadSectionData]);

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (!token) return undefined;
    const socket = io(import.meta.env.VITE_API_URL || window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: { token },
    });
    const refresh = () => {
      loadDashboard();
      loadSectionData();
    };
    [
      'oto_agents:agent_created',
      'oto_agents:agent_updated',
      'oto_agents:task_update',
      'oto_agents:task_created',
      'oto_agents:workflow_started',
      'oto_agents:workflow_completed',
      'oto_agents:approval_reviewed',
    ].forEach((event) => socket.on(event, refresh));
    return () => socket.disconnect();
  }, [loadDashboard, loadSectionData]);

  const metrics = dashboard?.metrics || {};
  const agents = dashboard?.agents || [];
  const pendingApprovals = dashboard?.pendingApprovals || [];
  const runningTasks = dashboard?.runningTasks || [];
  const logs = dashboard?.recentLogs || [];
  const assets = dashboard?.recentAssets || [];
  const socialAccounts = dashboard?.socialAccounts || [];
  const discoveries = dashboard?.discoveries || [];
  const workflows = dashboard?.workflows || [];
  const provider = dashboard?.provider || {};
  const executionDisabled = provider.configured === false;

  const featuredAgents = useMemo(() => agents.slice(0, 8), [agents]);

  const actionAgent = async (agent, action) => {
    const res = await API.post(`/api/admin/oto-agents/agents/${agent._id}/${action}`, {});
    if (res.error || res.data?.success === false) setActionError(res.error || res.data?.error || 'Agent action failed');
    await loadDashboard();
    await loadSectionData();
  };

  const runAgent = async (agent) => {
    if (executionDisabled) {
      setActionError('OPENAI_API_KEY is missing. Real execution is disabled until the provider is configured.');
      return;
    }
    const res = await API.post(`/api/admin/oto-agents/agents/${agent._id}/tasks`, {
      title: `${agent.name} operations brief`,
      taskType: agent.role === 'growth_seo' ? 'report' : agent.role === 'social_media' ? 'draft' : 'research',
      runNow: true,
      input: { source: 'admin_manual_run', section: activeSection },
    });
    if (res.error || res.data?.success === false) setActionError(res.error || res.data?.error || 'Task execution failed');
    await loadDashboard();
    await loadSectionData();
  };

  const reviewApproval = async (approval, status) => {
    await API.post(`/api/admin/oto-agents/approvals/${approval._id}/review`, { status });
    await loadDashboard();
  };

  const runManualPrompt = async () => {
    const agentId = selectedAgentId || agents[0]?._id;
    if (!agentId || !manualPrompt.trim()) return;
    if (executionDisabled) {
      setActionError('OPENAI_API_KEY is missing. Playground execution is disabled and no fake output will be produced.');
      return;
    }
    const res = await API.post(`/api/admin/oto-agents/agents/${agentId}/tasks`, {
      title: manualPrompt.slice(0, 90),
      description: manualPrompt,
      taskType: activeSection === 'AI Assets' ? 'asset' : activeSection === 'Reports' ? 'report' : 'research',
      runNow: true,
      input: { prompt: manualPrompt, source: 'agent_playground' },
    });
    setPlaygroundOutput(res.data?.task?.output || res.data?.error || null);
    if (res.error || res.data?.success === false) setActionError(res.error || res.data?.error || 'Task execution failed');
    await loadDashboard();
    await loadSectionData();
  };

  const editAgent = async (agent) => {
    const name = window.prompt('Agent name', agent.name || '');
    if (!name) return;
    const description = window.prompt('Agent description', agent.description || '');
    const res = await API.put(`/api/admin/oto-agents/agents/${agent._id}`, { name, description });
    if (res.error || res.data?.success === false) setActionError(res.error || res.data?.error || 'Agent update failed');
    await loadDashboard();
    await loadSectionData();
  };

  const deleteAgent = async (agent) => {
    if (!window.confirm(`Delete ${agent.name}? This archives the agent and preserves its audit history.`)) return;
    const res = await API.delete(`/api/admin/oto-agents/agents/${agent._id}`);
    if (res.error || res.data?.success === false) setActionError(res.error || res.data?.error || 'Agent delete failed');
    await loadDashboard();
    await loadSectionData();
  };

  const testAgentPrompt = async (agent) => {
    if (executionDisabled) {
      setActionError('OPENAI_API_KEY is missing. Prompt testing is disabled until a real provider is configured.');
      return;
    }
    const prompt = window.prompt('Prompt to test', manualPrompt || `Test ${agent.name}`);
    if (!prompt) return;
    const res = await API.post(`/api/admin/oto-agents/agents/${agent._id}/test`, { prompt });
    if (res.data?.success) setPlaygroundOutput(res.data.result);
    if (res.error || res.data?.success === false) setActionError(res.error || res.data?.error || 'Prompt test failed');
    await loadDashboard();
  };

  const retryTask = async (task) => {
    const res = await API.post(`/api/admin/oto-agents/tasks/${task._id}/retry`, {});
    if (res.error || res.data?.success === false) setActionError(res.error || res.data?.error || 'Retry failed');
    await loadDashboard();
    await loadSectionData();
  };

  const cancelTask = async (task) => {
    const res = await API.post(`/api/admin/oto-agents/tasks/${task._id}/cancel`, {});
    if (res.error || res.data?.success === false) setActionError(res.error || res.data?.error || 'Cancel failed');
    await loadDashboard();
    await loadSectionData();
  };

  const createPrompt = async () => {
    const name = window.prompt('Prompt name');
    const template = window.prompt('Prompt template');
    if (!name || !template) return;
    const res = await API.post('/api/admin/oto-agents/prompts', { name, template, category: 'custom' });
    if (res.error || res.data?.success === false) setActionError(res.error || res.data?.error || 'Prompt save failed');
    await loadSectionData();
  };

  const createWorkflow = async () => {
    const name = window.prompt('Workflow name');
    const agentId = selectedAgentId || agents[0]?._id;
    if (!name || !agentId) return;
    const res = await API.post('/api/admin/oto-agents/workflows', {
      name,
      agent: agentId,
      status: 'draft',
      steps: [
        { order: 1, name: 'Research', action: 'research', config: {} },
        { order: 2, name: 'Generate', action: 'generate_text', config: {} },
        { order: 3, name: 'Approval', action: 'request_approval', config: {} },
      ],
    });
    if (res.error || res.data?.success === false) setActionError(res.error || res.data?.error || 'Workflow save failed');
    await loadSectionData();
  };

  const executeWorkflow = async (workflow) => {
    const res = await API.post(`/api/admin/oto-agents/workflows/${workflow._id}/execute`, { runNow: true });
    if (res.error || res.data?.success === false) setActionError(res.error || res.data?.error || 'Workflow execution failed');
    await loadDashboard();
    await loadSectionData();
  };

  const addSocialAccount = async () => {
    const platform = window.prompt('Platform (instagram, x, linkedin, facebook, tiktok, reddit, youtube)');
    const username = window.prompt('Username');
    const token = window.prompt('Token/credential (stored encrypted, never shown again)');
    if (!platform || !username) return;
    const res = await API.post('/api/admin/oto-agents/social-accounts', { platform, username, token });
    if (res.error || res.data?.success === false) setActionError(res.error || res.data?.error || 'Account save failed');
    await loadDashboard();
    await loadSectionData();
  };

  const testSocialAccount = async (account) => {
    const res = await API.post(`/api/admin/oto-agents/social-accounts/${account._id}/test`, {});
    setActionError(res.data?.message || res.error || '');
    await loadSectionData();
  };

  const renderSection = () => {
    const data = sectionData[activeSection] || {};
    if (activeSection === 'Tasks') {
      const tasks = data.tasks || runningTasks;
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Operational Tasks</h2>
          <div className="mt-4 space-y-3">
            {tasks.map((task) => (
              <div key={task._id} className="rounded-xl bg-slate-50 p-4 dark:bg-slate-950">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{task.title}</p>
                    <p className="text-xs text-slate-500">{task.agent?.name} • {task.status} • retries {task.retryCount || 0}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => retryTask(task)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white">Retry</button>
                    <button onClick={() => cancelTask(task)} className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">Cancel</button>
                  </div>
                </div>
                <pre className="mt-3 max-h-48 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-cyan-50">{JSON.stringify({ output: task.output, logs: task.executionLogs, error: task.failureReason }, null, 2)}</pre>
              </div>
            ))}
            {!tasks.length && <p className="text-sm text-slate-500">No persisted tasks yet.</p>}
          </div>
        </div>
      );
    }
    if (activeSection === 'Reports') {
      const reports = data.reports || [];
      return <DataList title="Persisted Reports" items={reports} render={(r) => `${r.title} • ${r.type} • ${r.agent?.name || 'Agent'}`} />;
    }
    if (activeSection === 'Research Hub') {
      const items = data.discoveries || discoveries;
      return <DataList title="Research Discoveries" items={items} render={(r) => `${r.title} • ${r.category} • score ${r.opportunityScore ?? '--'}`} />;
    }
    if (activeSection === 'AI Assets') {
      const items = data.assets || assets;
      return <DataList title="AI Assets" items={items} render={(a) => `${a.title} • ${a.type} • ${a.status}`} />;
    }
    if (activeSection === 'Activity Timeline') {
      return <Timeline logs={data.logs || logs} />;
    }
    if (activeSection === 'Prompt Library') {
      const prompts = data.prompts || [];
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Prompt Library</h2>
            <button onClick={createPrompt} className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white dark:bg-white dark:text-slate-950">Create Prompt</button>
          </div>
          <DataRows items={prompts} render={(p) => `${p.name} • ${p.category}`} />
        </div>
      );
    }
    if (activeSection === 'Workflows') {
      const items = data.workflows || workflows;
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Workflow Engine</h2>
            <button onClick={createWorkflow} className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white dark:bg-white dark:text-slate-950">Create Workflow</button>
          </div>
          <div className="mt-4 space-y-3">
            {items.map((workflow) => (
              <div key={workflow._id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
                <span className="text-sm text-slate-900 dark:text-white">{workflow.name} • {workflow.steps?.length || 0} steps</span>
                <button onClick={() => executeWorkflow(workflow)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white">Execute</button>
              </div>
            ))}
            {!items.length && <p className="text-sm text-slate-500">No workflows persisted.</p>}
          </div>
        </div>
      );
    }
    if (activeSection === 'Social Accounts') {
      const accounts = data.accounts || socialAccounts;
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Social Accounts</h2>
            <button onClick={addSocialAccount} className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white dark:bg-white dark:text-slate-950">Add Account</button>
          </div>
          <div className="mt-4 space-y-3">
            {accounts.map((account) => (
              <div key={account._id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
                <span className="text-sm text-slate-900 dark:text-white">{account.platform} • @{account.username} • {account.status}</span>
                <button onClick={() => testSocialAccount(account)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white">Test</button>
              </div>
            ))}
            {!accounts.length && <p className="text-sm text-slate-500">No accounts connected.</p>}
          </div>
        </div>
      );
    }
    if (activeSection === 'Settings') {
      const status = data.provider || provider;
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Execution Settings</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <StatCard label="OpenAI" value={status.configured ? 'Online' : 'Missing'} detail={status.model || 'OPENAI_API_KEY required'} />
            <StatCard label="Tavily" value={status.researchConfigured ? 'Online' : 'Missing'} detail="Live research provider" />
            <StatCard label="Scheduler" value={data.scheduler?.queueTickMs ? 'Running' : 'Unknown'} detail={`${data.scheduler?.queueTickMs || 0}ms tick`} />
            <StatCard label="Websocket" value={data.websocket?.adminEvents ? 'Enabled' : 'Unknown'} detail="Admin realtime events" />
          </div>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-950 p-8 text-white">Initializing OTO Agents command center...</div>;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#172554,transparent_35%),linear-gradient(135deg,#020617,#0f172a_45%,#111827)] p-6 text-white">
      <CreateAgentModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={loadDashboard} />
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/10 p-6 text-white shadow-2xl backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-cyan-200">AI-operated telecom SaaS</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight">OTO Agents</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200">
                Enterprise AI operations center for growth, SEO, social intelligence, reputation monitoring,
                customer success, revenue optimization, competitive intelligence, and product strategy.
              </p>
            </div>
            <div className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-100">Autonomy Guardrail</p>
              <p className="mt-2 text-2xl font-semibold">{provider.configured ? 'AI Runtime Online' : 'AI Runtime Needs Key'}</p>
              <p className="mt-1 text-xs text-cyan-100">{provider.configured ? `${provider.provider} • ${provider.model}` : 'Set OPENAI_API_KEY to execute real AI tasks.'}</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={() => setCreateOpen(true)} className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg">
              Create New AI Agent
            </button>
            <button disabled={executionDisabled} onClick={runManualPrompt} className="rounded-2xl border border-cyan-300/40 px-5 py-3 text-sm font-semibold text-cyan-100 disabled:opacity-50">
              Run Playground Prompt
            </button>
          </div>
        </div>

        {error && <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-red-100">{error}</div>}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <StatCard label="Active agents" value={metrics.activeAgents || 0} detail={`${metrics.pausedAgents || 0} paused`} />
          <StatCard label="Tasks" value={metrics.completedTasks || 0} detail={`${metrics.runningTasks || 0} running • ${metrics.failedTasks || 0} failed`} />
          <StatCard label="Approvals pending" value={metrics.approvalsPending || 0} detail="Co-Pilot action queue" />
          <StatCard label="Reports / research" value={metrics.reportsGenerated || 0} detail={`${metrics.researchDiscoveries || 0} discoveries • ${metrics.generatedAssets || 0} assets`} />
        </div>

        <div className="rounded-3xl border border-white/10 bg-white p-5 shadow-xl dark:bg-slate-950">
          <div className="grid gap-4 lg:grid-cols-[220px_1fr_180px]">
            <select value={selectedAgentId} onChange={(e) => setSelectedAgentId(e.target.value)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900 dark:text-white">
              <option value="">Select agent</option>
              {agents.map((agent) => <option key={agent._id} value={agent._id}>{agent.name}</option>)}
            </select>
            <textarea value={manualPrompt} onChange={(e) => setManualPrompt(e.target.value)} className="h-24 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900 dark:text-white" placeholder="Enter a real task prompt for the selected agent..." />
            <button disabled={executionDisabled} onClick={runManualPrompt} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-950">
              Execute Task
            </button>
          </div>
          {executionDisabled && (
            <p className="mt-3 rounded-xl border border-amber-300/40 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              Real execution is disabled because the AI provider key is missing. No successful output will be simulated.
            </p>
          )}
          {playgroundOutput && (
            <pre className="mt-4 max-h-64 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-cyan-50">
              {typeof playgroundOutput === 'string' ? playgroundOutput : JSON.stringify(playgroundOutput, null, 2)}
            </pre>
          )}
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/80 p-3 shadow-xl backdrop-blur dark:bg-slate-950/70">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {sections.map((section) => (
              <button
                key={section}
                onClick={() => setActiveSection(section)}
                className={`whitespace-nowrap rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                  activeSection === section
                    ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900'
                }`}
              >
                {section}
              </button>
            ))}
          </div>
        </div>

        {actionError && <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-amber-100">{actionError}</div>}

        {activeSection !== 'Dashboard' && activeSection !== 'Agents' && (
          <div className="space-y-6">{renderSection()}</div>
        )}

        {(activeSection === 'Dashboard' || activeSection === 'Agents') && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {featuredAgents.map((agent) => (
                <AgentCard
                  key={agent._id}
                  agent={agent}
                  onAction={actionAgent}
                  onRun={runAgent}
                  onEdit={editAgent}
                  onDelete={deleteAgent}
                  onTest={testAgentPrompt}
                  executionDisabled={executionDisabled}
                />
              ))}
              {!featuredAgents.length && (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  No agents exist yet. Create one to start persisting real tasks, reports, memory, research, and audit logs.
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Live Tasks</h2>
              <div className="mt-4 space-y-3">
                {runningTasks.map((task) => (
                  <div key={task._id} className="rounded-xl bg-slate-50 p-4 dark:bg-slate-950">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{task.title}</p>
                        <p className="text-xs text-slate-500">{task.agent?.name} • {task.status}</p>
                      </div>
                      <span className="text-sm font-semibold text-indigo-500">{task.progress || 0}%</span>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-slate-200 dark:bg-slate-800">
                      <div className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400" style={{ width: `${Math.min(100, Number(task.progress || 0))}%` }} />
                    </div>
                    {task.failureReason && <p className="mt-2 text-xs text-red-500">{task.failureReason}</p>}
                  </div>
                ))}
                {!runningTasks.length && <p className="text-sm text-slate-500">No live tasks. Run a prompt or create a scheduled workflow.</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {discoveries.slice(0, 6).map((discovery) => (
                <div key={discovery._id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-sm font-semibold text-slate-950 dark:text-white">{discovery.title}</p>
                  <p className="mt-3 text-3xl font-semibold text-indigo-500">{discovery.opportunityScore ?? '--'}</p>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{discovery.summary || discovery.category}</p>
                </div>
              ))}
              {!discoveries.length && (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  Research discoveries will appear after real task execution.
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Approval Queue</h2>
              <div className="mt-4 space-y-3">
                {pendingApprovals.slice(0, 5).map((approval) => (
                  <div key={approval._id} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{approval.task?.title || approval.actionType}</p>
                    <p className="mt-1 text-xs text-slate-500">{approval.agent?.name} • {approval.riskLevel} risk</p>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => reviewApproval(approval, 'approved')} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white">Approve</button>
                      <button onClick={() => reviewApproval(approval, 'rejected')} className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">Reject</button>
                    </div>
                  </div>
                ))}
                {!pendingApprovals.length && <p className="text-sm text-slate-500">No pending approvals.</p>}
              </div>
            </div>

            <Timeline logs={logs} />

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Workflows</h2>
              <div className="mt-4 space-y-2">
                {workflows.slice(0, 5).map((workflow) => (
                  <div key={workflow._id} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{workflow.name}</p>
                    <p className="text-xs text-slate-500">{workflow.steps?.length || 0} steps • {workflow.status}</p>
                  </div>
                ))}
                {!workflows.length && <p className="text-sm text-slate-500">No workflows yet. Chain research, generation, approval, and publishing steps.</p>}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Connected Platforms</h2>
              <div className="mt-4 space-y-2">
                {socialAccounts.map((account) => (
                  <div key={account._id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-950">
                    <span className="font-medium text-slate-800 dark:text-slate-100">{account.platform}</span>
                    <span className="text-slate-500">@{account.username}</span>
                  </div>
                ))}
                {!socialAccounts.length && <p className="text-sm text-slate-500">No accounts connected yet. OAuth/token storage is backend-ready and redacted from the UI.</p>}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-lg font-semibold text-slate-950 dark:text-white">AI Assets</h2>
              <div className="mt-4 space-y-2">
                {assets.slice(0, 5).map((asset) => (
                  <div key={asset._id} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{asset.title}</p>
                    <p className="text-xs text-slate-500">{asset.type} • {asset.status}</p>
                  </div>
                ))}
                {!assets.length && <p className="text-sm text-slate-500">Generated content, briefs, and creative prompts will appear here.</p>}
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
