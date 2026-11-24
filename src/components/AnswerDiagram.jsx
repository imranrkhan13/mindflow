import { useEffect, useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlowProvider,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";
import { FileCode2 } from "lucide-react";

function SourceNode({ data }) {
  return (
    <div className={`mf-node ${data.active ? "active" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="mf-node-top">
        <FileCode2 size={15} />
        <span>{data.label}</span>
        <span className="mf-node-dot" />
      </div>
      <div className="mf-node-path">{data.path}</div>
      <div className="mf-node-foot">
        {data.citations.join(" · ")}
        <span>view source ↗</span>
      </div>
    </div>
  );
}

function QuestionNode({ data }) {
  return (
    <div className="mf-question-node">
      <Handle type="source" position={Position.Right} />
      <span>QUESTION</span>
      <strong>{data.label}</strong>
      <small>Connected to retrieved source evidence</small>
    </div>
  );
}

const nodeTypes = { source: SourceNode, question: QuestionNode };

function InnerDiagram({ nodes, edges, onSource, active, fitKey }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const id = setTimeout(() => fitView({ padding: 0.2, duration: 350 }), 70);
    return () => clearTimeout(id);
  }, [nodes.length, fitKey, fitView]);
  useEffect(() => {
    let timer;
    const resize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => fitView({ padding: 0.2, duration: 200 }), 150);
    };
    window.addEventListener("resize", resize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", resize);
    };
  }, [fitView]);
  const rendered = useMemo(() => {
    // A compact reading-order layout, not a claim about runtime sequence.
    const columns = Math.max(1, Math.ceil(nodes.length / 4)),
      rows = Math.ceil(nodes.length / columns);
    return nodes.map((n, i) => ({
      id: n.id,
      type: n.kind === "question" ? "question" : "source",
      position:
        n.kind === "question"
          ? { x: 0, y: 160 }
          : { x: 360 + Math.floor((i - 1) / rows) * 310, y: ((i - 1) % rows) * 145 },
      data: { ...n, active: active === n.path },
    }));
  }, [nodes, active]);
  return (
    <ReactFlow
      nodes={rendered}
      edges={edges.map((e) => ({
        ...e,
        animated: true,
        label: e.kind === "evidence" ? "source evidence" : `imports · L${e.line}`,
        style: { stroke: "#b07a57", strokeWidth: 1.6 },
        labelStyle: { fill: "#745b47", fontSize: 10 },
        labelBgStyle: { fill: "#fbf8f1" },
      }))}
      onNodeClick={(_, n) => n.data.path && onSource(n.data.path)}
      nodeTypes={nodeTypes}
      fitView
      minZoom={0.25}
      maxZoom={1.6}
      proOptions={{ hideAttribution: true }}
      nodesDraggable
    >
      <Background gap={22} size={1} color="#e8e1d4" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

export default function AnswerDiagram(props) {
  return (
    <ReactFlowProvider>
      <InnerDiagram {...props} />
    </ReactFlowProvider>
  );
}
