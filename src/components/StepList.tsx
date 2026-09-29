export type StepListItem = {
  label: string;
  description: string;
  active: boolean;
};

type StepListProps = {
  steps: readonly StepListItem[];
};

export default function StepList({ steps }: StepListProps) {
  return (
    <div className="step-list">
      {steps.map((step, index) => (
        <div className={`step ${step.active ? 'active' : ''}`} key={step.label}>
          <span>{String(index + 1).padStart(2, '0')}</span>
          <div>
            <strong>{step.label}</strong>
            <small>{step.description}</small>
          </div>
        </div>
      ))}
    </div>
  );
}
