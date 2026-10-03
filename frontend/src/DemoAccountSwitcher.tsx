import type { DemoIdentity } from "./demoAuth";
import {ChoicePicker} from './ChoicePicker';

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
        <ChoicePicker
          label="切换演示帐号"
          id="demo-account-select"
          value={selected}
          disabled={loading}
          onChange={(value) => {
            void onSwitch(value === "1" ? 1 : value === "2" ? 2 : null);
          }}
          options={[{value:'',label:'访客'},{value:'1',label:'小林'},{value:'2',label:'阿远'}]}
        />
      </div>
      {loading && <span className="demo-account-status" role="status">正在确认帐号…</span>}
      {error && <span className="demo-account-error" role="alert">{error} <button type="button" onClick={onRetry}>重试</button></span>}
    </div>
  );
}
