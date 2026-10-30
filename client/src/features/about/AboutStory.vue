<script setup>
defineOptions({ name: 'SharlockAboutStory' })
import PixelIcon from '../../components/town/PixelIcon.vue'
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
          >Explore the town <PixelIcon name="arrow" :size="20" aria-hidden="true"
        /></RouterLink>
      </div>
      <div class="hero-art">
        <img
          src="/images/town/capybara-mint.svg"
          class="mascot-image hero-mascot"
          width="320"
          height="240"
          alt="Sharlock, a friendly pixel-art capybara wearing a mint scarf"
        />
      </div>
    </section>
    <section class="landing-intro" aria-labelledby="learning-heading">
      <div>
        <h2 id="learning-heading">Less memorising.<br />More investigating.</h2>
      </div>
      <p>Decode clues, question messages, decide who gets access.</p>
      <SharlockTip
        text="A good detective pauses, checks the evidence, and asks why. Those are cybersecurity skills, too."
      />
    </section>
    <div class="landing-benefits">
      <div>
        <PixelIcon name="map" :size="29" aria-hidden="true" />
        <h3>Find your own “aha!”</h3>
      </div>
      <div>
        <PixelIcon name="shield" :size="29" aria-hidden="true" />
        <h3>Put ideas into practice</h3>
      </div>
      <div>
        <PixelIcon name="trophy" :size="29" aria-hidden="true" />
        <h3>Celebrate the little wins</h3>
      </div>
    </div>
    <section class="about-details" aria-labelledby="about-companion-heading">
      <h2 id="about-companion-heading">Meet your curious companion.</h2>
      <p>Learn introductory cybersecurity through short investigations.</p>
      <h2>Made for learning</h2>
      <p>Built by Boey, Keane, Eric, Russell, Xin Lei, and Athithya for WAD2.</p>
      <p class="preview-notice">
        Sign in to read The Sharlock Times and play the activities. Points and badges come from
        saved results.
      </p>
    </section>
    <section id="graphics" class="about-details" aria-labelledby="about-graphics-heading">
      <h2 id="about-graphics-heading">3D and 2D modes</h2>
      <p>
        The town is 3D by default. Phones (touch screens under 768px wide) and devices without WebGL
        2 open the 2D town. You can switch any time, and your choice is remembered.
      </p>
      <p>
        On Auto, Sharlock lowers graphics, then switches to 2D if needed. Settings overrides this.
      </p>
    </section>
  </div>
</template>
