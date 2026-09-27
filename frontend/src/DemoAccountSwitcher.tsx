import type { DemoIdentity } from "./demoAuth";

type Props = {
  identity: DemoIdentity | null;
  loading: boolean;
  error: string;
  onSwitch: (id: 1 | 2 | null) => Promise<void>;
  onRetry: () => void;
};

export function DemoAccountSwitcher({ identity, loading, error, onSwitch, onRetry }: Props) {
  const selected = identity?.user?.id?.toString() ?? "";

  return (
    <div className="demo-account-switcher">
      <span className="demo-account-caption">演示帐号，仅用于黑客松功能验证</span>
      <div className="demo-account-control">
        <label htmlFor="demo-account-select">切换演示帐号</label>
        <select
          id="demo-account-select"
          value={selected}
          disabled={loading}
          onChange={(event) => {
            const value = event.target.value;
            void onSwitch(value === "1" ? 1 : value === "2" ? 2 : null);
          }}
        >
          <option value="">访客</option>
          <option value="1">小林</option>
          <option value="2">阿远</option>
        </select>
      </div>
      {loading && <span className="demo-account-status" role="status">正在确认帐号…</span>}
      {error && <span className="demo-account-error" role="alert">{error} <button type="button" onClick={onRetry}>重试</button></span>}
    </div>
  );
}
