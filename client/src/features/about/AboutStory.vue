<script setup>
defineOptions({ name: 'SharlockAboutStory' })
import PixelIcon from '../../components/town/PixelIcon.vue'
import ConnectionStatus from '../../components/portal/ConnectionStatus.vue'
import SharlockTip from '../../components/portal/SharlockTip.vue'
import { nextTick, onMounted } from 'vue'

// the router does not scroll to hashes, so the graphics section is brought into view here
onMounted(async () => {
  if (location.hash !== '#graphics') return
  await nextTick()
  document.getElementById('graphics')?.scrollIntoView()
})
</script>
<template>
  <div class="landing-view">
    <p class="eyebrow landing-eyebrow">
      <span class="tiny-dot"></span> BIG CURIOSITY. SMALL ADVENTURES.
    </p>
    <section class="landing-hero">
      <div class="landing-copy">
        <h1 tabindex="-1">
          The internet has<br />its mysteries.<br /><span class="pixel-underline"
            >Let's solve them.</span
          >
        </h1>
        <p>
          Meet Sharlock, your curious capybara companion. Turn cybersecurity fundamentals into
          little adventures worth figuring out.
        </p>
        <RouterLink to="/" class="btn btn-primary"
          >Explore the town <PixelIcon name="arrow" :size="20" aria-hidden="true" /></RouterLink
        ><span class="landing-preview-note">Sign in to explore · every activity is open</span>
      </div>
      <div class="hero-art">
        <span class="art-label art-label-top"
          ><PixelIcon name="shield" :size="20" aria-hidden="true" /> Trust your curiosity.</span
        ><img
          src="/images/town/capybara-mint.svg"
          class="mascot-image hero-mascot"
          width="320"
          height="240"
          alt="Sharlock, a friendly pixel-art capybara wearing a mint scarf"
        /><span class="art-label art-label-bottom">Your trusty sidekick, Sharlock.</span>
      </div>
    </section>
    <section class="landing-intro" aria-labelledby="learning-heading">
      <div>
        <p class="eyebrow">LEARN BY FIGURING IT OUT</p>
        <h2 id="learning-heading">Less memorising.<br />More investigating.</h2>
      </div>
      <p>
        Decode a clue, question a message, or decide who gets access. Each small case helps you
        understand the decisions that keep our digital world safer.
      </p>
      <SharlockTip
        text="A good detective pauses, checks the evidence, and asks why. Those are cybersecurity skills, too."
      />
    </section>
    <div class="landing-benefits">
      <div>
        <PixelIcon name="map" :size="29" aria-hidden="true" />
        <h3>Find your own “aha!”</h3>
        <p>Follow a friendly trail through the fundamentals.</p>
      </div>
      <div>
        <PixelIcon name="shield" :size="29" aria-hidden="true" />
        <h3>Put ideas into practice</h3>
        <p>Make decisions in short, controlled exercises.</p>
      </div>
      <div>
        <PixelIcon name="trophy" :size="29" aria-hidden="true" />
        <h3>Celebrate the little wins</h3>
        <p>Watch your skills grow, one completed case at a time.</p>
      </div>
    </div>
    <section class="about-details" aria-labelledby="about-companion-heading">
      <h2 id="about-companion-heading">Meet your curious companion.</h2>
      <p>
        Sharlock turns introductory cybersecurity into a trail of small investigations. Explore
        encryption, integrity, permissions, and defensive thinking with a friendly capybara by your
        side.
      </p>
      <h2>Made for learning</h2>
      <p>
        Built by Boey, Keane, Eric, Russell, Xin Lei, and Athithya for WAD2. Our aim is to make
        foundational concepts easier to apply through interactive, controlled exercises.
      </p>
      <p class="preview-notice">
        Create an account or sign in to read The Sharlock Times and explore the town's games and
        previews. Your account and avatar are saved. Points and badges are earned from saved
        activity results, and only some activities save results so far.
      </p>
    </section>
    <section id="graphics" class="about-details" aria-labelledby="about-graphics-heading">
      <h2 id="about-graphics-heading">3D and 2D modes</h2>
      <p>
        The town is 3D by default. On devices without WebGL 2, or ones that draw in software,
        Sharlock picks the 2D town automatically. Low-memory devices start on low graphics. You can
        change Graphics or switch between 3D and 2D any time, and your choice is remembered.
      </p>
      <p>
        If it's struggling: on Auto, Sharlock watches how smoothly the 3D town runs. It lowers
        graphics step by step and, if that is still not enough, switches to the 2D town. The
        Graphics setting and the 2D/3D toggle let you override this any time.
      </p>
    </section>
    <ConnectionStatus />
  </div>
</template>
