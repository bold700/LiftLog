/* bold700 HQ · 3D-overzicht van projecten en agents. Data: window.HQ_DATA (ingebed) of data/*.json. */
(async function () {
  const $ = (s) => document.querySelector(s);
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- data ----------
  async function loadData() {
    if (window.HQ_DATA) return window.HQ_DATA;
    const [repos, registry] = await Promise.all([
      fetch("data/repos.json").then((r) => r.json()),
      fetch("data/registry.json").then((r) => r.json()),
    ]);
    return { repos, registry };
  }
  const { repos: snapshot, registry } = await loadData();
  const owner = registry.owner || "bold700";
  const clusters = registry.clusters;
  const clusterKeys = Object.keys(clusters);
  const now = Date.now();
  const DAY = 864e5;

  const projects = snapshot.repos.map((r) => {
    const reg = registry.projects[r.name] || {};
    const days = Math.max(0, (now - Date.parse(r.pushed_at)) / DAY);
    const status = reg.status || (r.archived ? "archived" : days > 365 ? "paused" : "active");
    const cluster = clusters[reg.cluster] ? reg.cluster : "lab";
    const agents = [...new Set([...(clusters[cluster].agents || []), ...(reg.agents || [])])];
    return { ...r, days, status, cluster, agents, description: reg.description || r.description || "", links: reg.links || {} };
  });
  for (const [name, reg] of Object.entries(registry.projects)) {
    if (!projects.some((p) => p.name === name)) {
      const cluster = clusters[reg.cluster] ? reg.cluster : "lab";
      projects.push({ name, days: 9999, pushed_at: null, status: reg.status || "idea", cluster, private: false,
        agents: [...new Set([...(clusters[cluster].agents || []), ...(reg.agents || [])])], description: reg.description || "", links: reg.links || {} });
    }
  }
  projects.sort((a, b) => a.days - b.days);
  $("#brand-sub").textContent = `${projects.length} projecten · ${Object.keys(registry.agents).length} agents · ${clusterKeys.length} clusters`;

  const heat = (d) => (d < 30 ? 1 : d < 180 ? 0.55 : d < 365 ? 0.3 : 0.16);
  const rel = (d, p) => {
    if (!p) return "nog geen repo";
    if (d < 1) return "vandaag";
    if (d < 30) return `${Math.round(d)} d geleden`;
    if (d < 365) return `${Math.round(d / 30)} mnd geleden`;
    return `${(d / 365).toFixed(1)} jr geleden`;
  };
  const statusNL = { active: "actief", paused: "gepauzeerd", archived: "gearchiveerd", idea: "idee" };
  const statusColor = { active: "#3ddc97", paused: "#ffc94a", archived: "#5d6580", idea: "#7c5cff" };

  // ---------- scene ----------
  const canvas = $("#space");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x0a0d18, 1);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0d18, 0.012);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  camera.position.set(0, 34, 62);
  const controls = new THREE.OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.06;
  controls.minDistance = 8; controls.maxDistance = 140; controls.maxPolarAngle = Math.PI * 0.55;
  controls.autoRotate = !reduceMotion; controls.autoRotateSpeed = 0.25;
  canvas.addEventListener("pointerdown", () => (controls.autoRotate = false), { once: true });

  scene.add(new THREE.AmbientLight(0x8090c0, 0.35));
  const key = new THREE.PointLight(0xffe2a8, 1.4, 0, 2); key.position.set(0, 12, 0); scene.add(key);

  // sterrenhemel
  {
    const n = 1800, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 120 + Math.random() * 120, t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1);
      pos.set([r * Math.sin(p) * Math.cos(t), r * Math.cos(p) * 0.6, r * Math.sin(p) * Math.sin(t)], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9aa7d0, size: 0.35, sizeAttenuation: true, transparent: true, opacity: 0.8 })));
  }

  // HQ-kern
  const core = new THREE.Mesh(new THREE.SphereGeometry(1.6, 48, 48), new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffb84a, emissiveIntensity: 0.9, roughness: 0.4 }));
  scene.add(core);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(2.6, 32, 32), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.08 }));
  scene.add(halo);

  const labels = $("#labels");
  const labelEls = []; // {el, obj, offsetY}
  function addLabel(text, obj, cls, color, offsetY = 0) {
    const el = document.createElement("div");
    el.className = "label " + (cls || ""); el.textContent = text;
    if (color) el.style.setProperty("--lc", color);
    labels.appendChild(el); labelEls.push({ el, obj, offsetY }); return el;
  }
  addLabel("HQ", core, "core", null, 2.6);

  const pickables = []; // meshes with userData.kind
  const clusterHubs = {};
  const R = 26;
  clusterKeys.forEach((k, i) => {
    const c = clusters[k];
    const ang = (i / clusterKeys.length) * Math.PI * 2 - Math.PI / 2;
    const center = new THREE.Vector3(Math.cos(ang) * R, Math.sin(i * 1.7) * 2.5, Math.sin(ang) * R);
    const color = new THREE.Color(c.color);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.05, 8, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 }));
    ring.position.copy(center); ring.rotation.x = Math.PI / 2; scene.add(ring);
    const disc = new THREE.Mesh(new THREE.RingGeometry(2.4, 9.5, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.035, side: THREE.DoubleSide }));
    disc.position.copy(center); disc.rotation.x = -Math.PI / 2; scene.add(disc);
    const link = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), center]), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.18 }));
    scene.add(link);
    const members = projects.filter((p) => p.cluster === k);
    addLabel(`${c.label} · ${members.length}`, ring, "cluster", c.color, 2.9);
    clusterHubs[k] = { center, color, ring, members, agentMeshes: [], group: new THREE.Group() };
    scene.add(clusterHubs[k].group);

    // agents als satellieten rond de ring
    (c.agents || []).forEach((a, j) => {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffb84a, emissiveIntensity: 0.5, flatShading: true }));
      m.userData = { kind: "agent", name: a, cluster: k, phase: (j / (c.agents.length || 1)) * Math.PI * 2, r: 3.4 + j * 0.35, speed: 0.25 + j * 0.05 };
      scene.add(m); pickables.push(m); clusterHubs[k].agentMeshes.push(m);
      addLabel(a, m, "agent", null, 0.8);
    });

    // repos in een spiraal (zonnebloem) rond de ring
    const golden = Math.PI * (3 - Math.sqrt(5));
    members.forEach((p, j) => {
      const h = heat(p.days);
      const rr = 3.6 + Math.sqrt(j + 0.5) * 1.55;
      const t = j * golden;
      const pos = new THREE.Vector3(center.x + Math.cos(t) * rr, center.y + (h - 0.4) * 1.6 + Math.sin(j) * 0.3, center.z + Math.sin(t) * rr);
      const size = 0.28 + h * 0.75;
      const mat = p.status === "archived"
        ? new THREE.MeshBasicMaterial({ color: 0x5d6580, wireframe: true })
        : new THREE.MeshStandardMaterial({ color: color.clone().lerp(new THREE.Color(0xffffff), h * 0.45), emissive: color, emissiveIntensity: 0.15 + h * 1.1, roughness: 0.45 });
      const m = new THREE.Mesh(new THREE.SphereGeometry(size, 24, 24), mat);
      m.position.copy(pos); m.userData = { kind: "project", p, baseScale: 1 };
      scene.add(m); pickables.push(m); p.mesh = m;
      if (h >= 1) { // gloed voor verse repos
        const g = new THREE.Mesh(new THREE.SphereGeometry(size * 1.9, 16, 16), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12 }));
        g.position.copy(pos); scene.add(g);
      }
      if (p.private) {
        const lock = new THREE.Mesh(new THREE.TorusGeometry(size * 1.35, 0.035, 6, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
        lock.position.copy(pos); lock.rotation.x = Math.PI / 2; scene.add(lock);
      }
    });
  });

  // ---------- UI: rail ----------
  const clustersNav = $("#clusters");
  let activeCluster = null;
  clusterKeys.forEach((k) => {
    const b = document.createElement("button");
    b.style.setProperty("--c", clusters[k].color);
    b.innerHTML = `<i></i>${clusters[k].label} <b>${clusterHubs[k].members.length}</b>`;
    b.addEventListener("click", () => { activeCluster = activeCluster === k ? null : k; applyFilter(); if (activeCluster) flyTo(clusterHubs[k].center, 22); });
    b.dataset.k = k; clustersNav.appendChild(b);
  });
  const agentList = $("#agent-list");
  for (const [a, info] of Object.entries(registry.agents)) {
    const li = document.createElement("li"); li.textContent = a; li.title = info.description; agentList.appendChild(li);
  }
  const list = $("#project-list");
  projects.forEach((p) => {
    const li = document.createElement("li"); li.tabIndex = 0;
    li.style.setProperty("--c", clusters[p.cluster].color); li.style.setProperty("--o", 0.35 + heat(p.days) * 0.65);
    li.innerHTML = `<i></i><span>${p.name}</span><time>${rel(p.days, p.pushed_at)}</time>`;
    li.addEventListener("click", () => select(p));
    li.addEventListener("keydown", (e) => { if (e.key === "Enter") select(p); });
    p.li = li; list.appendChild(li);
  });

  const q = $("#q");
  q.addEventListener("input", applyFilter);
  function applyFilter() {
    const term = q.value.trim().toLowerCase();
    clustersNav.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.k === activeCluster));
    projects.forEach((p) => {
      const hit = (!term || p.name.toLowerCase().includes(term) || p.description.toLowerCase().includes(term) || p.agents.some((a) => a.includes(term)))
        && (!activeCluster || p.cluster === activeCluster);
      p.li.classList.toggle("dim", !hit);
      if (p.mesh) { p.mesh.userData.baseScale = hit ? 1 : 0.35; if (p.mesh.material.opacity !== undefined) p.mesh.material.opacity = hit ? 1 : 0.25; }
    });
  }

  // ---------- selectie en paneel ----------
  const panel = $("#panel");
  let selected = null;
  function select(p) {
    selected = p;
    projects.forEach((x) => x.li.classList.toggle("on", x === p));
    const c = clusters[p.cluster];
    panel.style.setProperty("--pc", c.color);
    $("#p-cluster").textContent = c.label;
    $("#p-name").textContent = p.name;
    $("#p-desc").textContent = p.description || "Nog geen beschrijving; voeg er een toe in registry.json.";
    $("#p-status").innerHTML = `<span class="status" style="--sc:${statusColor[p.status]}">${statusNL[p.status] || p.status}</span>`;
    $("#p-push").textContent = rel(p.days, p.pushed_at);
    $("#p-vis").textContent = p.private ? "privé" : "publiek";
    $("#p-agents").innerHTML = p.agents.map((a) => `<li title="${(registry.agents[a] || {}).description || ""}">${a}</li>`).join("");
    const links = [];
    if (p.pushed_at) links.push(`<a href="https://github.com/${owner}/${p.name}" target="_blank" rel="noopener">GitHub</a>`);
    for (const [k, v] of Object.entries(p.links)) links.push(`<a class="ghost" href="${v}" target="_blank" rel="noopener">${k}</a>`);
    links.push(`<a class="ghost" href="https://claude.ai/code" target="_blank" rel="noopener">Open in Claude Code</a>`);
    $("#p-links").innerHTML = links.join("");
    panel.hidden = false;
    if (p.mesh) flyTo(p.mesh.position, 9);
    p.li.scrollIntoView({ block: "nearest" });
  }
  $("#panel-close").addEventListener("click", () => { panel.hidden = true; selected = null; projects.forEach((x) => x.li.classList.remove("on")); });

  // camera-vlucht
  let fly = null;
  function flyTo(target, dist) {
    controls.autoRotate = false;
    const dir = camera.position.clone().sub(controls.target).normalize();
    const to = target.clone().add(dir.multiplyScalar(dist)).add(new THREE.Vector3(0, dist * 0.35, 0));
    fly = { t0: performance.now(), from: camera.position.clone(), to, tFrom: controls.target.clone(), tTo: target.clone(), dur: reduceMotion ? 1 : 900 };
  }

  // hover en klik
  const ray = new THREE.Raycaster(); const mouse = new THREE.Vector2(); const tip = $("#tip");
  let hovered = null, downAt = null;
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    return hit ? hit.object : null;
  }
  canvas.addEventListener("pointermove", (e) => {
    hovered = pick(e);
    canvas.style.cursor = hovered ? "pointer" : "";
    if (hovered) {
      const u = hovered.userData;
      tip.innerHTML = u.kind === "project" ? `${u.p.name}<small>${clusters[u.p.cluster].label} · ${rel(u.p.days, u.p.pushed_at)}</small>` : `◆ ${u.name}<small>agent · ${clusters[u.cluster].label}</small>`;
      tip.style.left = e.clientX + 14 + "px"; tip.style.top = e.clientY + 14 + "px"; tip.hidden = false;
    } else tip.hidden = true;
  });
  canvas.addEventListener("pointerdown", (e) => (downAt = [e.clientX, e.clientY]));
  canvas.addEventListener("pointerup", (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
    const o = pick(e); if (!o) return;
    if (o.userData.kind === "project") select(o.userData.p);
    else { q.value = o.userData.name; activeCluster = null; applyFilter(); flyTo(clusterHubs[o.userData.cluster].center, 20); }
  });
  canvas.addEventListener("pointerleave", () => (tip.hidden = true));

  // ---------- loop ----------
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize); resize();

  const v = new THREE.Vector3();
  function tick(t) {
    requestAnimationFrame(tick);
    const s = t / 1000;
    if (fly) {
      const k = Math.min(1, (t - fly.t0) / fly.dur), e = 1 - Math.pow(1 - k, 3);
      camera.position.lerpVectors(fly.from, fly.to, e); controls.target.lerpVectors(fly.tFrom, fly.tTo, e);
      if (k >= 1) fly = null;
    }
    controls.update();
    core.scale.setScalar(1 + Math.sin(s * 1.4) * 0.03); halo.scale.setScalar(1 + Math.sin(s * 1.4 + 1) * 0.08);
    for (const k of clusterKeys) {
      const hub = clusterHubs[k];
      for (const m of hub.agentMeshes) {
        const u = m.userData, a = u.phase + s * u.speed * (reduceMotion ? 0 : 1);
        m.position.set(hub.center.x + Math.cos(a) * u.r, hub.center.y + 0.6 + Math.sin(a * 2) * 0.25, hub.center.z + Math.sin(a) * u.r);
        m.rotation.y = s * 0.8;
      }
    }
    for (const m of pickables) {
      if (m.userData.kind !== "project") continue;
      const target = m.userData.baseScale * (m === hovered || (selected && selected.mesh === m) ? 1.5 : 1);
      m.scale.setScalar(m.scale.x + (target - m.scale.x) * 0.15);
    }
    // labels projecteren
    const w = innerWidth, h = innerHeight;
    for (const L of labelEls) {
      L.obj.getWorldPosition(v); v.y += L.offsetY; v.project(camera);
      const on = v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
      L.el.style.opacity = on ? (L.el.classList.contains("agent") ? (camera.position.distanceTo(L.obj.position) < 40 ? 1 : 0) : 1) : 0;
      if (on) L.el.style.transform = `translate(-50%,-50%) translate(${(v.x + 1) / 2 * w}px, ${(1 - v.y) / 2 * h}px)`;
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(tick);
})().catch((err) => {
  document.body.insertAdjacentHTML("beforeend", `<pre style="position:fixed;inset:auto 16px 16px;padding:12px;background:#2a1010;color:#ffd2d2;border-radius:8px;font:12px/1.4 monospace;white-space:pre-wrap">De wereld kon niet laden: ${err.message}\nControleer of data/repos.json en data/registry.json bestaan.</pre>`);
  console.error(err);
});
