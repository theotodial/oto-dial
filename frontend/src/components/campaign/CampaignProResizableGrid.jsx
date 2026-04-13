import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

const handleClass =
  'w-1.5 bg-slate-200/90 dark:bg-slate-600 hover:bg-indigo-300 dark:hover:bg-indigo-600 data-[panel-resize-handle-enabled=true]:data-[panel-group-direction=horizontal]:cursor-col-resize data-[panel-resize-handle-enabled=true]:data-[panel-group-direction=vertical]:cursor-row-resize shrink-0 transition-colors';

const vHandleClass =
  'h-1.5 bg-slate-200/90 dark:bg-slate-600 hover:bg-indigo-300 dark:hover:bg-indigo-600 data-[panel-resize-handle-enabled=true]:data-[panel-group-direction=vertical]:cursor-row-resize shrink-0 transition-colors';

/**
 * Fixed layouts: 1 full, 2 horizontal, 3 horizontal, 4 as 2×2. No empty cells.
 */
export default function CampaignProResizableGrid({ paneIds, renderPane, autoSaveId = 'campaign-pro' }) {
  const n = paneIds.length;
  if (n === 0) return null;

  if (n === 1) {
    return (
      <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">{renderPane(paneIds[0])}</div>
    );
  }

  if (n === 2) {
    return (
      <PanelGroup direction="horizontal" autoSaveId={`${autoSaveId}-2`} className="flex-1 min-h-0 min-w-0">
        <Panel defaultSize={50} minSize={12} className="min-h-0 min-w-0">
          {renderPane(paneIds[0])}
        </Panel>
        <PanelResizeHandle className={handleClass} />
        <Panel defaultSize={50} minSize={12} className="min-h-0 min-w-0">
          {renderPane(paneIds[1])}
        </Panel>
      </PanelGroup>
    );
  }

  if (n === 3) {
    return (
      <PanelGroup direction="horizontal" autoSaveId={`${autoSaveId}-3`} className="flex-1 min-h-0 min-w-0">
        <Panel defaultSize={34} minSize={10} className="min-h-0 min-w-0">
          {renderPane(paneIds[0])}
        </Panel>
        <PanelResizeHandle className={handleClass} />
        <Panel defaultSize={33} minSize={10} className="min-h-0 min-w-0">
          {renderPane(paneIds[1])}
        </Panel>
        <PanelResizeHandle className={handleClass} />
        <Panel defaultSize={33} minSize={10} className="min-h-0 min-w-0">
          {renderPane(paneIds[2])}
        </Panel>
      </PanelGroup>
    );
  }

  return (
    <PanelGroup direction="vertical" autoSaveId={`${autoSaveId}-4v`} className="flex-1 min-h-0 min-w-0">
      <Panel defaultSize={50} minSize={18} className="min-h-0 min-w-0">
        <PanelGroup direction="horizontal" autoSaveId={`${autoSaveId}-4t`} className="h-full min-h-0 min-w-0">
          <Panel defaultSize={50} minSize={12} className="min-h-0 min-w-0">
            {renderPane(paneIds[0])}
          </Panel>
          <PanelResizeHandle className={handleClass} />
          <Panel defaultSize={50} minSize={12} className="min-h-0 min-w-0">
            {renderPane(paneIds[1])}
          </Panel>
        </PanelGroup>
      </Panel>
      <PanelResizeHandle className={vHandleClass} />
      <Panel defaultSize={50} minSize={18} className="min-h-0 min-w-0">
        <PanelGroup direction="horizontal" autoSaveId={`${autoSaveId}-4b`} className="h-full min-h-0 min-w-0">
          <Panel defaultSize={50} minSize={12} className="min-h-0 min-w-0">
            {renderPane(paneIds[2])}
          </Panel>
          <PanelResizeHandle className={handleClass} />
          <Panel defaultSize={50} minSize={12} className="min-h-0 min-w-0">
            {renderPane(paneIds[3])}
          </Panel>
        </PanelGroup>
      </Panel>
    </PanelGroup>
  );
}
