// Frannie's Trainer — training/video surgical update
// Load this file AFTER app.js.
//
// What this update does:
// 1) Replaces Lesson 1 "Calm starts with Mollie" with "Everyone Sets the Tone".
// 2) Retires the old Short used in Lesson 1 and uses the new door/greeting video.
// 3) Adds a separate Training Video Library to the Good Girl program.
// 4) Keeps the six-lesson progress system, care data, logs, backup, PDF, and storage untouched.
// 5) Adds the long barking video as Extra Help rather than a seventh required lesson.

(function () {
  "use strict";

  // ---- Lesson 1 surgical replacement ----
  if (typeof lessons !== "undefined" && Array.isArray(lessons) && lessons.length) {
    lessons[0] = {
      title: "Everyone Sets the Tone",
      sub: "Consistent greetings, calm entrances, and the same rules from every human",
      intro:
        "Frannie learns faster when every person responds to excitement the same way. This first practice gives the whole household one simple rule: calm behavior gets attention and access; jumping and frantic greetings do not move the interaction forward.",
      steps: [
        "Before entering or greeting Frannie, decide that everyone will use the same rule: four paws down before attention.",
        "Enter calmly. Avoid excited voices, leaning over her, or immediately petting her while she is jumping.",
        "If Frannie jumps or becomes frantic, pause the greeting and remove attention without yelling or turning it into a wrestling match.",
        "The moment she has four paws down or offers a calmer body, mark the calmer choice with “yes” and greet or reward her.",
        "Have each regular family member practice the same pattern so one person is not accidentally rewarding what another person is trying to stop.",
        "Keep repetitions short. The goal is a predictable household routine, not a perfect greeting on the first day."
      ],
      tip:
        "Consistency is the lesson. If one person rewards jumping while another person discourages it, Frannie receives two different rules. Everyone who regularly interacts with her helps set the tone.",
      minutes: 6,
      videoId: "dVaBb156yWA",
      videoTitle: "Door & Greeting Training",
      videoNote:
        "Full-length training resource for calmer greetings and reducing jumping when people enter. Use the household rule consistently with everyone who regularly greets Frannie."
    };
  }

  // Update focus mappings so door/jumping work points at the new foundation lesson too.
  if (typeof focusLessonMap !== "undefined") {
    focusLessonMap["Door chaos"] = [0, 1, 4];
    focusLessonMap["Jumping on people"] = [0, 3, 4];
    focusLessonMap["Visitor behavior"] = [0, 4];
  }

  const resources = [
    {
      id: "dVaBb156yWA",
      category: "Featured · Greetings",
      title: "Door & Greeting Training",
      note: "The companion video for Everyone Sets the Tone: calmer entrances, greetings, and jumping behavior."
    },
    {
      id: "mM-YIoJyko8",
      category: "Leash pulling",
      title: "How To FIX Leash Pulling in UNDER 10 Minutes!",
      note: "Outside-trainer resource focused specifically on leash pulling."
    },
    {
      id: "ax_j0OQYXBE",
      category: "Biting / nipping",
      title: "Puppy Biting Help",
      note: "Cesar Millan resource for puppy biting and nipping."
    },
    {
      id: "6DCOTE5ng_g",
      category: "Extra Help · Barking",
      title: "When the Barking Won’t Stop",
      note: "Long-form resource for excessive or persistent barking. Useful when Frannie has trouble settling, including after meals or during crate time."
    },
    {
      id: "BjYEWjlIS7g",
      category: "More training resources",
      title: "Additional Training Video",
      note: "Saved in Frannie’s library for reference."
    },
    {
      id: "BA03fJxB2aU",
      category: "More training resources",
      title: "Additional Training Video",
      note: "Saved in Frannie’s library for reference."
    },
    {
      id: "YcDeH50swKY",
      category: "More training resources",
      title: "Additional Training Video",
      note: "Saved in Frannie’s library for reference."
    }
  ];

  function openLibraryVideo(item) {
    const modal = document.getElementById("videoModal");
    const title = document.getElementById("modalTitle");
    const fallback = document.getElementById("youtubeFallback");
    const frame = document.getElementById("videoFrame");

    if (!modal || !title || !fallback || !frame) {
      window.open(`https://www.youtube.com/watch?v=${item.id}`, "_blank", "noopener");
      return;
    }

    title.textContent = item.title;
    fallback.href = `https://www.youtube.com/watch?v=${item.id}`;
    frame.innerHTML =
      `<iframe src="https://www.youtube-nocookie.com/embed/${item.id}?autoplay=1&rel=0&playsinline=1"` +
      ` title="${item.title.replace(/"/g, "&quot;")}"` +
      ` allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"` +
      ` allowfullscreen></iframe>`;
    modal.classList.add("open");
    // The app shell already owns scrolling. Avoid body overflow mutations,
    // which can leave iOS WebKit displaying a dim compositing layer.
  }

  function buildLibrary() {
    const plan = document.getElementById("plan");
    if (!plan || document.getElementById("trainingVideoLibrary")) return;

    const card = document.createElement("div");
    card.className = "card";
    card.id = "trainingVideoLibrary";
    card.style.marginTop = "16px";

    const cards = resources.map((item, index) => `
      <div class="video-card" style="margin-top:${index ? "12px" : "10px"}">
        <div class="thumb-wrap">
          <img src="https://i.ytimg.com/vi/${item.id}/hqdefault.jpg" alt="${item.title.replace(/"/g, "&quot;")} thumbnail">
          <div class="play">▶</div>
        </div>
        <div class="video-copy">
          <small style="display:block;margin-bottom:4px"><strong>${item.category}</strong></small>
          <strong>${item.title}</strong>
          <small>${item.note}</small>
          <button type="button" data-resource-index="${index}">Watch inside app</button>
        </div>
      </div>
    `).join("");

    card.innerHTML = `
      <div class="lesson-top">
        <div>
          <div class="eyebrow" style="color:var(--pink3)">Reference library</div>
          <h2>Training Video Library</h2>
        </div>
        <span class="pill">Extra help</span>
      </div>
      <p>
        The six foundation lessons stay compact. This library holds additional full-length videos for specific problems,
        including selected trainers outside Cesar Millan when the resource is useful.
      </p>
      <p>
        <strong>Professional trainer note:</strong> when Frannie’s trainer provides her own videos or instructions,
        those can be added here and should take priority for Frannie’s individual training plan.
      </p>
      ${cards}
    `;

    plan.appendChild(card);

    card.querySelectorAll("[data-resource-index]").forEach((button) => {
      button.addEventListener("click", () => {
        openLibraryVideo(resources[Number(button.dataset.resourceIndex)]);
      });
    });
  }

  function updateCesarOnlyWording() {
    const hero = document.querySelector(".hero p");
    if (hero) {
      hero.textContent =
        "Clear practice sessions for Frannie and her family. Written lessons work on their own; selected training videos are optional visual companions.";
    }

    document.querySelectorAll("#home .card").forEach((card) => {
      const heading = card.querySelector("h3");
      if (!heading || !heading.textContent.includes("Cesar")) return;

      heading.textContent = "How this guide uses training resources";
      const paragraphs = card.querySelectorAll("p");

      if (paragraphs[0]) {
        paragraphs[0].textContent =
          "The foundation still draws heavily from Cesar Millan themes such as calm human energy, observation, timing, leadership, leash handling, trust, respect, and structured walking. Written instructions remain original and use rewards, distance, repetition, management, and gradual exposure.";
      }

      if (paragraphs[1]) {
        paragraphs[1].textContent =
          "This is not an official course and is not affiliated with Cesar Millan or the other trainers shown. Videos are optional reference material and stream from YouTube.";
      }
    });
  }

  function refreshVisibleTrainingUI() {
    // If app.js has already rendered modules, redraw them so Lesson 1 shows the new title.
    if (typeof renderModules === "function") renderModules();
  }

  function initTrainingUpdate() {
    updateCesarOnlyWording();
    buildLibrary();
    refreshVisibleTrainingUI();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTrainingUpdate, { once: true });
  } else {
    initTrainingUpdate();
  }
})();
