import { Bot, Brain, Cpu, Eye, Gauge as GaugeIcon, Puzzle, Shield, ShieldAlert, ShieldCheck, Sparkles, Wrench } from 'lucide-react';
import type { EffortSetting, PermissionMode } from '@shared/types';
import { fmtPrice, fmtTokens, shortModel } from '../../lib/format';
import type { AgentInfo, ModelInfo } from '../../lib/types';
import { Caret, Chip, Dropdown, type MenuItem } from '../ui';

export const EFFORT_LABEL: Record<EffortSetting, string> = {
  auto: 'Auto',
  none: 'Aucun',
  minimal: 'Minimal',
  low: 'Faible',
  medium: 'Moyen',
  high: 'Élevé',
  xhigh: 'Très élevé',
  max: 'Max',
};

export const MODE_META: Record<PermissionMode, { label: string; hint: string; icon: JSX.Element; tone: string }> = {
  safe: { label: 'Lecture seule', hint: 'SAFE — aucune modification, aucune commande modifiante', icon: <ShieldCheck size={14} />, tone: 'text-info' },
  normal: { label: 'Demander', hint: 'NORMAL — demande avant de modifier les fichiers ou lancer des commandes sensibles', icon: <Shield size={14} />, tone: 'text-muted' },
  autonomous: { label: 'Autonome', hint: 'AUTONOMOUS — modifie et exécute librement, confirme seulement le dangereux', icon: <ShieldAlert size={14} />, tone: 'text-warn' },
};

export function modelHint(m: ModelInfo): string {
  const caps = [m.capabilities.tools ? 'outils' : 'sans outils', m.capabilities.vision && 'vision', m.capabilities.reasoning && 'raisonnement'].filter(Boolean).join(' · ');
  return `${m.provider} · ${fmtTokens(m.contextLength)} ctx · ${fmtPrice(m.inputPrice)}/${fmtPrice(m.outputPrice)} par M · ${caps}`;
}

const PROVIDER_ORDER = ['anthropic', 'openai', 'google', 'deepseek', 'x-ai', 'mistralai', 'meta-llama', 'qwen', 'z-ai', 'moonshotai'];

export function sortModels(models: ModelInfo[]): ModelInfo[] {
  return [...models].sort((a, b) => {
    const pa = PROVIDER_ORDER.indexOf(a.provider);
    const pb = PROVIDER_ORDER.indexOf(b.provider);
    if (a.capabilities.tools !== b.capabilities.tools) return a.capabilities.tools ? -1 : 1;
    if (pa !== pb) return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
    return b.created - a.created;
  });
}

export function ModelPicker({ value, models, onChange, placement = 'top' }: { value: string; models: ModelInfo[]; onChange: (id: string) => void; placement?: 'top' | 'bottom' }) {
  const items: MenuItem[] = [
    { value: 'auto', label: 'Auto — choix intelligent', hint: 'Choisit le modèle selon la tâche (rapide, raisonnement, vision, puissant)', icon: <Sparkles size={14} /> },
    ...sortModels(models).map((m) => ({ value: m.id, label: m.name.replace(/^[^:]+:\s*/, ''), hint: modelHint(m), icon: m.capabilities.vision ? <Eye size={13} /> : m.capabilities.reasoning ? <Brain size={13} /> : <Cpu size={13} /> })),
  ];
  return (
    <Dropdown
      trigger={
        <Chip title="Modèle">
          <Sparkles size={13} />
          <span className="max-w-[160px] truncate">{shortModel(value)}</span>
          <Caret />
        </Chip>
      }
      items={items}
      value={value}
      onSelect={onChange}
      width={420}
      align="right"
      placement={placement}
      search
      header={`${models.length} modèles OpenRouter (catalogue en direct)`}
    />
  );
}

export function EffortPicker({ value, model, onChange }: { value: EffortSetting; model?: ModelInfo; onChange: (v: EffortSetting) => void }) {
  const levels: EffortSetting[] = ['auto', ...((model?.efforts.length ? model.efforts : ['low', 'medium', 'high', 'xhigh', 'max']) as EffortSetting[])];
  return (
    <Dropdown
      trigger={
        <Chip title="Niveau d'effort / de raisonnement" active={value !== 'auto'}>
          <GaugeIcon size={13} /> {EFFORT_LABEL[value]}
          <Caret />
        </Chip>
      }
      items={levels.map((l) => ({ value: l, label: EFFORT_LABEL[l], hint: l === 'auto' ? `Défaut du modèle${model?.defaultEffort ? ` (${EFFORT_LABEL[model.defaultEffort]})` : ''}` : undefined }))}
      value={value}
      onSelect={onChange}
      width={230}
      align="right"
      placement="top"
      header={model && !model.efforts.length ? "Ce modèle n'expose pas de niveau d'effort : le réglage sera ignoré." : 'Plus élevé = réflexion plus profonde, plus lent et plus coûteux'}
    />
  );
}

export function AgentPicker({ value, agents, onChange }: { value: string; agents: AgentInfo[]; onChange: (id: string) => void }) {
  const current = agents.find((a) => a.id === value);
  return (
    <Dropdown
      trigger={
        <Chip title="Agent" active={value !== 'general'}>
          <Bot size={13} /> <span className="max-w-[130px] truncate">{current?.label ?? value}</span>
          <Caret />
        </Chip>
      }
      items={agents.map((a) => ({ value: a.id, label: `${a.label}${a.custom ? ' ✦' : ''}`, hint: a.description, icon: a.custom ? <Wrench size={13} /> : <Bot size={13} /> }))}
      value={value}
      onSelect={onChange}
      width={360}
      placement="top"
      search={agents.length > 8}
      header="Agents intégrés et personnalisés (✦). Les instructions de l'agent sont imposées au modèle."
    />
  );
}

export function SkillsPicker({ selected, skills, onToggle }: { selected: string[]; skills: { name: string; description: string; disabled: boolean }[]; onToggle: (name: string) => void }) {
  return (
    <Dropdown
      trigger={
        <Chip title="Skills épinglés pour la session" active={selected.length > 0}>
          <Puzzle size={13} /> {selected.length ? `${selected.length} skill${selected.length > 1 ? 's' : ''}` : 'Skills'}
          <Caret />
        </Chip>
      }
      items={skills.filter((k) => !k.disabled).map((k) => ({ value: k.name, label: `${selected.includes(k.name) ? '☑' : '☐'} ${k.name}`, hint: k.description.slice(0, 140) }))}
      onSelect={onToggle}
      width={420}
      placement="top"
      search
      header="Épinglé = instructions du skill injectées et obligatoires à chaque message. Les autres s'activent automatiquement s'ils correspondent à la demande."
    />
  );
}

export function ModePicker({ value, onChange }: { value: PermissionMode; onChange: (m: PermissionMode) => void }) {
  const meta = MODE_META[value];
  return (
    <Dropdown
      trigger={
        <Chip title={`${meta.hint} (Maj+Tab pour changer)`}>
          <span className={meta.tone}>{meta.icon}</span> {meta.label}
          <Caret />
        </Chip>
      }
      items={(['safe', 'normal', 'autonomous'] as PermissionMode[]).map((m) => ({ value: m, label: MODE_META[m].label, hint: MODE_META[m].hint, icon: <span className={MODE_META[m].tone}>{MODE_META[m].icon}</span> }))}
      value={value}
      onSelect={onChange}
      width={340}
      placement="top"
    />
  );
}
