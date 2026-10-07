import {Component, type ReactNode} from 'react';
import {Link} from 'react-router';

export class RouteLoadBoundary extends Component<{children:ReactNode;onReload:()=>void},{failed:boolean}>{
  override state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  override render(){
    return this.state.failed?<section className="status-card error-card" role="alert">
      <p>页面暂时未能打开。</p>
      <button type="button" onClick={this.props.onReload}>重新加载页面</button>
      <Link className="text-button" to="/">返回首页</Link>
    </section>:this.props.children;
  }
}
