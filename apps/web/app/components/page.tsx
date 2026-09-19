import LoadingPreview from '../../components/loading-preview';
import { AppShell, Button, Dialog, FormField } from '@guide/ui';
import { GuideCard } from '@guide/guide-ui';
import { ArrowUpRight, Check, Info } from 'lucide-react';
export default function ComponentsPage() {
  return (
    <AppShell active="components">
      <main id="main" className="workshop page-width" tabIndex={-1}>
        <header className="workshop-header">
          <div className="eyebrow">THE SHARED FOUNDATION</div>
          <h1>A system, with character.</h1>
          <p>
            One visual language for community knowledge and everyday work. Try the controls, switch
            the theme, and use your keyboard.
          </p>
        </header>
        <div className="workshop-grid">
          <section className="spec-panel">
            <div className="spec-heading">
              <span>01 / ACTIONS</span>
              <h2>Clear intent. Familiar behavior.</h2>
            </div>
            <div className="component-row">
              <Button>
                Primary action
                <ArrowUpRight size={16} />
              </Button>
              <Button variant="secondary">Secondary action</Button>
              <Button variant="ghost">Quiet action</Button>
            </div>
            <div className="component-row">
              <Button loading>Saving</Button>
              <Button disabled>Unavailable</Button>
            </div>
            <p className="component-note">
              Loading and unavailable actions prevent repeat activation. Keyboard focus uses a
              separated outline.
            </p>
          </section>
          <section className="spec-panel">
            <div className="spec-heading">
              <span>02 / FIELDS</span>
              <h2>Helpful at every step.</h2>
            </div>
            <FormField
              label="Guide title"
              defaultValue="A clear starting point"
              description="Name the task your reader will complete."
            />
            <FormField
              label="Example with an error"
              error="Add a title before continuing."
              placeholder="Enter a guide title"
              required
            />
          </section>
          <section className="spec-panel">
            <div className="spec-heading">
              <span>03 / DIALOGS</span>
              <h2>Space to make a decision.</h2>
            </div>
            <p>
              A focused conversation with a clear way back. Tab stays inside; Escape closes and
              returns focus.
            </p>
            <Dialog
              trigger={<Button variant="secondary">Open example dialog</Button>}
              title="A little context goes a long way."
              description="This example demonstrates the shared dialog behavior."
            >
              <p>
                Reusable components carry their keyboard and accessibility behavior into every
                workspace.
              </p>
              <div className="callout callout--info">
                <Info size={19} />
                <div>
                  <h3>Try the keyboard</h3>
                  <p>Press Tab to move within the dialog, then Escape to close it.</p>
                </div>
              </div>
            </Dialog>
          </section>
          <section className="spec-panel">
            <div className="spec-heading">
              <span>04 / FEEDBACK</span>
              <h2>Meaning beyond color.</h2>
            </div>
            <div className="status-example">
              <Check size={18} />
              <span>Changes saved successfully</span>
            </div>
            <div className="callout callout--warning">
              <Info size={19} />
              <div>
                <h3>Check before continuing</h3>
                <p>Context and a next action accompany every warning.</p>
              </div>
            </div>
          </section>
          <section className="spec-panel wide-panel">
            <div>
              <div className="spec-heading">
                <span>05 / GUIDE PRESENTATION</span>
                <h2>The same card, wherever knowledge lives.</h2>
              </div>
              <p>
                Readable hierarchy, purposeful illustration, and useful metadata. The library and
                team preview share this component.
              </p>
              <div className="swatch-row">
                <span className="swatch swatch-canvas">Canvas</span>
                <span className="swatch swatch-panel">Panel</span>
                <span className="swatch swatch-action">Action</span>
                <span className="swatch swatch-accent">Accent</span>
              </div>
            </div>
            <GuideCard
              title="Get to know a bicycle brake"
              summary="A closer look at the small adjustments that keep a daily ride feeling right."
              category="Bicycles"
              minutes={20}
              difficulty="moderate"
              steps={5}
              artwork="bicycle"
              href="/guides/bicycle-brake"
            />
          </section>
          <section className="spec-panel wide-panel loading-panel">
            <div>
              <div className="spec-heading">
                <span>06 / LOADING</span>
                <h2>A clear signal while you wait.</h2>
              </div>
              <p>Skeletons preserve the shape of a collection as its content arrives.</p>
            </div>
            <LoadingPreview />
          </section>
        </div>
      </main>
    </AppShell>
  );
}
