/**
 * The panel harness, served by the same Vite config as the app harness.
 *
 * `test/widget-preview.tsx` holds the state matrix and mounts it; this entry
 * exists to pull in the *real* content-script stylesheet alongside it, so the
 * states are rendered against the sheet that actually ships rather than against
 * a copy of it that drifted. Run it with `npm run preview` and open /widget.html.
 *
 * The faces are the one thing this harness cannot be faithful about: the panel
 * loads them through `runtime.getURL`, which does not exist outside an extension
 * context, so they are declared here against the dev server's own /fonts.
 */

import "../../entrypoints/content/widget.css";
import "./widget-fonts.css";
import "../widget-preview.tsx";
