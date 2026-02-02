/* ===================================
   Advanced Portfolio - Ruphak Varmaa
   Three.js + GSAP Animations
   =================================== */

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', () => {
    // Initialize all modules
    initLoader();
    initThreeJS();
    initCustomCursor();
    initNavigation();
    initThemeToggle();
    initTypingEffect();
    initCounters();
    initScrollAnimations();
    initSkillBars();
    initProjectFilter();
    initMagneticButtons();
    initParallax();
    initBackToTop();
    initContactForm();
    initSplitText();
});

/* ===================================
   Loading Screen
   =================================== */
function initLoader() {
    const loader = document.getElementById('loader');
    const progress = document.getElementById('loaderProgress');
    let width = 0;

    const interval = setInterval(() => {
        width += Math.random() * 15;
        if (width >= 100) {
            width = 100;
            clearInterval(interval);
            setTimeout(() => {
                loader.classList.add('hidden');
                // Trigger hero animations
                animateHero();
            }, 500);
        }
        progress.style.width = width + '%';
    }, 100);
}

/* ===================================
   Three.js Particle System
   =================================== */
function initThreeJS() {
    const canvas = document.getElementById('webgl-canvas');

    // Scene
    const scene = new THREE.Scene();

    // Camera
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 50;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Particle System
    const particlesCount = 2000;
    const positions = new Float32Array(particlesCount * 3);
    const colors = new Float32Array(particlesCount * 3);
    const sizes = new Float32Array(particlesCount);

    const colorPalette = [
        new THREE.Color('#6c5ce7'),
        new THREE.Color('#a29bfe'),
        new THREE.Color('#74b9ff'),
        new THREE.Color('#81ecec')
    ];

    for (let i = 0; i < particlesCount; i++) {
        const i3 = i * 3;

        // Position
        positions[i3] = (Math.random() - 0.5) * 150;
        positions[i3 + 1] = (Math.random() - 0.5) * 150;
        positions[i3 + 2] = (Math.random() - 0.5) * 150;

        // Color
        const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
        colors[i3] = color.r;
        colors[i3 + 1] = color.g;
        colors[i3 + 2] = color.b;

        // Size
        sizes[i] = Math.random() * 2;
    }

    const particlesGeometry = new THREE.BufferGeometry();
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    particlesGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // Custom Shader Material
    const particlesMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
            uMouse: { value: new THREE.Vector2(0, 0) }
        },
        vertexShader: `
            uniform float uTime;
            uniform float uPixelRatio;
            uniform vec2 uMouse;

            attribute float size;
            attribute vec3 color;

            varying vec3 vColor;
            varying float vOpacity;

            void main() {
                vColor = color;

                vec3 pos = position;

                // Wave animation
                pos.x += sin(uTime * 0.5 + position.y * 0.05) * 2.0;
                pos.y += cos(uTime * 0.3 + position.x * 0.05) * 2.0;
                pos.z += sin(uTime * 0.4 + position.z * 0.05) * 1.5;

                // Mouse interaction
                float dist = distance(pos.xy, uMouse * 50.0);
                pos.z += smoothstep(20.0, 0.0, dist) * 10.0;

                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                gl_Position = projectionMatrix * mvPosition;

                // Size attenuation
                gl_PointSize = size * uPixelRatio * (100.0 / -mvPosition.z);

                // Distance-based opacity
                vOpacity = smoothstep(150.0, 0.0, -mvPosition.z);
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            varying float vOpacity;

            void main() {
                // Circular point
                float dist = distance(gl_PointCoord, vec2(0.5));
                if (dist > 0.5) discard;

                // Soft glow
                float glow = 1.0 - smoothstep(0.0, 0.5, dist);

                gl_FragColor = vec4(vColor, glow * vOpacity * 0.6);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    const particles = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particles);

    // Connecting Lines
    const linesGeometry = new THREE.BufferGeometry();
    const linePositions = new Float32Array(300 * 3);
    linesGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));

    const linesMaterial = new THREE.LineBasicMaterial({
        color: 0x6c5ce7,
        transparent: true,
        opacity: 0.1
    });

    const lines = new THREE.LineSegments(linesGeometry, linesMaterial);
    scene.add(lines);

    // Mouse tracking
    const mouse = new THREE.Vector2();
    let targetMouse = new THREE.Vector2();

    document.addEventListener('mousemove', (e) => {
        targetMouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        targetMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    // Scroll tracking
    let scrollY = 0;
    window.addEventListener('scroll', () => {
        scrollY = window.scrollY;
    });

    // Animation
    const clock = new THREE.Clock();

    function animate() {
        const elapsedTime = clock.getElapsedTime();

        // Smooth mouse movement
        mouse.x += (targetMouse.x - mouse.x) * 0.05;
        mouse.y += (targetMouse.y - mouse.y) * 0.05;

        // Update uniforms
        particlesMaterial.uniforms.uTime.value = elapsedTime;
        particlesMaterial.uniforms.uMouse.value = mouse;

        // Rotate particles
        particles.rotation.y = elapsedTime * 0.05;
        particles.rotation.x = Math.sin(elapsedTime * 0.1) * 0.1;

        // Move camera based on scroll
        camera.position.y = -scrollY * 0.02;
        camera.position.z = 50 + scrollY * 0.01;

        // Update connecting lines
        updateLines();

        renderer.render(scene, camera);
        requestAnimationFrame(animate);
    }

    function updateLines() {
        const positions = particlesGeometry.attributes.position.array;
        const linePositions = linesGeometry.attributes.position.array;
        const threshold = 15;
        let lineIndex = 0;

        for (let i = 0; i < 100 && lineIndex < linePositions.length; i++) {
            const i3 = i * 3;
            const x1 = positions[i3];
            const y1 = positions[i3 + 1];
            const z1 = positions[i3 + 2];

            for (let j = i + 1; j < 100 && lineIndex < linePositions.length - 6; j++) {
                const j3 = j * 3;
                const x2 = positions[j3];
                const y2 = positions[j3 + 1];
                const z2 = positions[j3 + 2];

                const dist = Math.sqrt((x2-x1)**2 + (y2-y1)**2 + (z2-z1)**2);

                if (dist < threshold) {
                    linePositions[lineIndex++] = x1;
                    linePositions[lineIndex++] = y1;
                    linePositions[lineIndex++] = z1;
                    linePositions[lineIndex++] = x2;
                    linePositions[lineIndex++] = y2;
                    linePositions[lineIndex++] = z2;
                }
            }
        }

        linesGeometry.attributes.position.needsUpdate = true;
    }

    // Handle resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        particlesMaterial.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
    });

    animate();
}

/* ===================================
   Custom Cursor
   =================================== */
function initCustomCursor() {
    const cursor = document.getElementById('cursor');
    const follower = document.getElementById('cursorFollower');

    if (!cursor || !follower) return;

    let mouseX = 0, mouseY = 0;
    let cursorX = 0, cursorY = 0;
    let followerX = 0, followerY = 0;

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    // Smooth cursor animation
    function animateCursor() {
        // Cursor follows immediately
        cursorX += (mouseX - cursorX) * 0.2;
        cursorY += (mouseY - cursorY) * 0.2;
        cursor.style.left = cursorX + 'px';
        cursor.style.top = cursorY + 'px';

        // Follower has more delay
        followerX += (mouseX - followerX) * 0.1;
        followerY += (mouseY - followerY) * 0.1;
        follower.style.left = followerX + 'px';
        follower.style.top = followerY + 'px';

        requestAnimationFrame(animateCursor);
    }

    animateCursor();

    // Hover effects
    const hoverElements = document.querySelectorAll('a, button, .magnetic-btn, .project-card, .skill-item');

    hoverElements.forEach(el => {
        el.addEventListener('mouseenter', () => {
            cursor.classList.add('hover');
            follower.classList.add('hover');
        });

        el.addEventListener('mouseleave', () => {
            cursor.classList.remove('hover');
            follower.classList.remove('hover');
        });
    });
}

/* ===================================
   Navigation
   =================================== */
function initNavigation() {
    const navbar = document.getElementById('navbar');
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');
    const navLinks = document.querySelectorAll('.nav-link');

    // Scroll effect
    window.addEventListener('scroll', () => {
        if (window.scrollY > 100) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Mobile menu toggle
    navToggle.addEventListener('click', () => {
        navToggle.classList.toggle('active');
        navMenu.classList.toggle('active');
    });

    // Close menu on link click
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            navToggle.classList.remove('active');
            navMenu.classList.remove('active');
        });
    });

    // Active link on scroll
    const sections = document.querySelectorAll('section[id]');

    window.addEventListener('scroll', () => {
        let current = '';

        sections.forEach(section => {
            const sectionTop = section.offsetTop - 200;
            if (window.scrollY >= sectionTop) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${current}`) {
                link.classList.add('active');
            }
        });
    });
}

/* ===================================
   Theme Toggle
   =================================== */
function initThemeToggle() {
    const toggle = document.getElementById('themeToggle');
    const html = document.documentElement;

    // Check saved theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    html.setAttribute('data-theme', savedTheme);

    toggle.addEventListener('click', () => {
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        html.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);

        // Add transition class
        document.body.style.transition = 'background-color 0.5s, color 0.5s';
    });
}

/* ===================================
   Typing Effect
   =================================== */
function initTypingEffect() {
    const typingText = document.getElementById('typingText');
    if (!typingText) return;

    const words = ['Web Applications', 'Cloud Solutions', 'Clean Code', 'Digital Experiences', 'REST APIs'];
    let wordIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    let isPaused = false;

    function type() {
        const currentWord = words[wordIndex];

        if (!isDeleting) {
            typingText.textContent = currentWord.substring(0, charIndex + 1);
            charIndex++;

            if (charIndex === currentWord.length) {
                isPaused = true;
                setTimeout(() => {
                    isPaused = false;
                    isDeleting = true;
                }, 2000);
            }
        } else {
            typingText.textContent = currentWord.substring(0, charIndex - 1);
            charIndex--;

            if (charIndex === 0) {
                isDeleting = false;
                wordIndex = (wordIndex + 1) % words.length;
            }
        }

        const speed = isDeleting ? 50 : isPaused ? 0 : 100;
        if (!isPaused) setTimeout(type, speed);
        else setTimeout(type, 0);
    }

    // Start after loader
    setTimeout(type, 1500);
}

/* ===================================
   Counter Animation
   =================================== */
function initCounters() {
    const counters = document.querySelectorAll('.counter');

    const animateCounter = (counter) => {
        const target = parseInt(counter.getAttribute('data-target'));
        const duration = 2000;
        const start = 0;
        const startTime = performance.now();

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Easing function
            const easeOutQuart = 1 - Math.pow(1 - progress, 4);
            const current = Math.floor(easeOutQuart * target);

            counter.textContent = current;

            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                counter.textContent = target;
            }
        }

        requestAnimationFrame(update);
    };

    // Intersection Observer
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateCounter(entry.target);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    counters.forEach(counter => observer.observe(counter));
}

/* ===================================
   Scroll Animations with GSAP
   =================================== */
function initScrollAnimations() {
    // Register ScrollTrigger
    gsap.registerPlugin(ScrollTrigger);

    // Reveal animations
    const revealElements = document.querySelectorAll('.reveal-up');

    revealElements.forEach((el, index) => {
        const delay = el.getAttribute('data-delay') || 0;

        gsap.fromTo(el,
            {
                opacity: 0,
                y: 50
            },
            {
                opacity: 1,
                y: 0,
                duration: 0.8,
                delay: parseFloat(delay),
                ease: 'power3.out',
                scrollTrigger: {
                    trigger: el,
                    start: 'top 85%',
                    toggleActions: 'play none none none'
                }
            }
        );
    });

    // Section headers
    gsap.utils.toArray('.section-header').forEach(header => {
        gsap.fromTo(header,
            { opacity: 0, x: -50 },
            {
                opacity: 1,
                x: 0,
                duration: 0.8,
                ease: 'power3.out',
                scrollTrigger: {
                    trigger: header,
                    start: 'top 80%'
                }
            }
        );
    });

    // Glass cards
    gsap.utils.toArray('.glass-card').forEach((card, index) => {
        gsap.fromTo(card,
            { opacity: 0, y: 30, scale: 0.95 },
            {
                opacity: 1,
                y: 0,
                scale: 1,
                duration: 0.6,
                delay: index * 0.1,
                ease: 'power3.out',
                scrollTrigger: {
                    trigger: card,
                    start: 'top 85%'
                }
            }
        );
    });

    // Timeline progress
    const timeline = document.querySelector('.timeline');
    if (timeline) {
        ScrollTrigger.create({
            trigger: timeline,
            start: 'top center',
            end: 'bottom center',
            onUpdate: (self) => {
                const progress = document.getElementById('timelineProgress');
                if (progress) {
                    progress.style.height = self.progress * 100 + '%';
                }
            }
        });
    }

    // Parallax for decorations
    gsap.utils.toArray('.visual-decoration').forEach(el => {
        gsap.to(el, {
            y: -50,
            ease: 'none',
            scrollTrigger: {
                trigger: el,
                start: 'top bottom',
                end: 'bottom top',
                scrub: 1
            }
        });
    });
}

/* ===================================
   Hero Animation
   =================================== */
function animateHero() {
    const tl = gsap.timeline();

    tl.fromTo('.hero-badge',
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }
    )
    .fromTo('.title-small',
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' },
        '-=0.3'
    )
    .fromTo('.title-name',
        { opacity: 0, y: 50, scale: 0.9 },
        { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: 'power3.out' },
        '-=0.3'
    )
    .fromTo('.title-role',
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' },
        '-=0.3'
    )
    .fromTo('.hero-description .word',
        { opacity: 0, y: 20 },
        {
            opacity: 1,
            y: 0,
            duration: 0.4,
            stagger: 0.03,
            ease: 'power3.out'
        },
        '-=0.3'
    )
    .fromTo('.hero-cta',
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' },
        '-=0.2'
    )
    .fromTo('.stat-item',
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.1, ease: 'power3.out' },
        '-=0.3'
    )
    .fromTo('.hero-scroll',
        { opacity: 0 },
        { opacity: 1, duration: 0.5 },
        '-=0.2'
    )
    .fromTo('.hero-social',
        { opacity: 0, x: -20 },
        { opacity: 1, x: 0, duration: 0.5 },
        '-=0.3'
    );
}

/* ===================================
   Skill Bars Animation
   =================================== */
function initSkillBars() {
    const skillBars = document.querySelectorAll('.skill-progress');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const bar = entry.target;
                const width = bar.getAttribute('data-width');
                bar.style.width = width + '%';
                observer.unobserve(bar);
            }
        });
    }, { threshold: 0.5 });

    skillBars.forEach(bar => observer.observe(bar));
}

/* ===================================
   Project Filter
   =================================== */
function initProjectFilter() {
    const filterBtns = document.querySelectorAll('.filter-btn');
    const projectCards = document.querySelectorAll('.project-card');

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active button
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const filter = btn.getAttribute('data-filter');

            projectCards.forEach(card => {
                const category = card.getAttribute('data-category');

                if (filter === 'all' || category === filter) {
                    gsap.to(card, {
                        opacity: 1,
                        scale: 1,
                        duration: 0.4,
                        ease: 'power3.out'
                    });
                    card.style.display = 'block';
                } else {
                    gsap.to(card, {
                        opacity: 0,
                        scale: 0.9,
                        duration: 0.4,
                        ease: 'power3.out',
                        onComplete: () => {
                            card.style.display = 'none';
                        }
                    });
                }
            });
        });
    });
}

/* ===================================
   Magnetic Buttons
   =================================== */
function initMagneticButtons() {
    const magneticElements = document.querySelectorAll('.magnetic-btn');

    magneticElements.forEach(el => {
        el.addEventListener('mousemove', (e) => {
            const rect = el.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;

            gsap.to(el, {
                x: x * 0.3,
                y: y * 0.3,
                duration: 0.3,
                ease: 'power3.out'
            });
        });

        el.addEventListener('mouseleave', () => {
            gsap.to(el, {
                x: 0,
                y: 0,
                duration: 0.5,
                ease: 'elastic.out(1, 0.5)'
            });
        });
    });
}

/* ===================================
   Parallax Effects
   =================================== */
function initParallax() {
    window.addEventListener('scroll', () => {
        const scrollY = window.scrollY;

        // Hero parallax
        const hero = document.querySelector('.hero-content');
        if (hero) {
            hero.style.transform = `translateY(${scrollY * 0.3}px)`;
            hero.style.opacity = 1 - scrollY * 0.002;
        }

        // Floating cards parallax
        document.querySelectorAll('.floating-card').forEach((card, i) => {
            card.style.transform = `translateY(${Math.sin(scrollY * 0.01 + i) * 10}px)`;
        });
    });
}

/* ===================================
   Back to Top
   =================================== */
function initBackToTop() {
    const btn = document.getElementById('backToTop');
    const circle = document.querySelector('.progress-ring-circle');
    const circumference = 2 * Math.PI * 45;

    if (circle) {
        circle.style.strokeDasharray = circumference;
        circle.style.strokeDashoffset = circumference;
    }

    window.addEventListener('scroll', () => {
        const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
        const scrollProgress = window.scrollY / scrollHeight;

        if (window.scrollY > 500) {
            btn.classList.add('visible');
        } else {
            btn.classList.remove('visible');
        }

        // Update progress ring
        if (circle) {
            circle.style.strokeDashoffset = circumference * (1 - scrollProgress);
        }
    });

    btn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

/* ===================================
   Contact Form
   =================================== */
function initContactForm() {
    const form = document.getElementById('contactForm');
    if (!form) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        // Get form data
        const formData = new FormData(form);
        const data = Object.fromEntries(formData);

        // Here you would typically send the data to a server
        console.log('Form submitted:', data);

        // Show success message
        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;

        btn.innerHTML = '<span class="btn-text">Message Sent!</span><span class="btn-icon"><i class="fas fa-check"></i></span>';
        btn.style.background = 'linear-gradient(135deg, #00d26a 0%, #00b894 100%)';

        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.background = '';
            form.reset();
        }, 3000);
    });
}

/* ===================================
   Split Text Animation
   =================================== */
function initSplitText() {
    const splitTextElements = document.querySelectorAll('.split-text');

    splitTextElements.forEach(el => {
        const text = el.textContent;
        el.textContent = '';

        text.split('').forEach((char, i) => {
            const span = document.createElement('span');
            span.classList.add('char');
            span.textContent = char === ' ' ? '\u00A0' : char;
            span.style.transitionDelay = `${i * 0.03}s`;
            el.appendChild(span);
        });

        // Intersection Observer
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    el.classList.add('revealed');
                    observer.unobserve(el);
                }
            });
        }, { threshold: 0.5 });

        observer.observe(el);
    });
}

/* ===================================
   Smooth Scroll
   =================================== */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            const offsetY = 80;
            const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - offsetY;
            window.scrollTo({
                top: targetPosition,
                behavior: 'smooth'
            });
        }
    });
});

/* ===================================
   Orbit Hover Effects
   =================================== */
document.querySelectorAll('.orbit-item').forEach(item => {
    item.addEventListener('mouseenter', () => {
        gsap.to(item, {
            scale: 1.3,
            duration: 0.3,
            ease: 'power3.out'
        });
    });

    item.addEventListener('mouseleave', () => {
        gsap.to(item, {
            scale: 1,
            duration: 0.3,
            ease: 'power3.out'
        });
    });
});

/* ===================================
   Tilt Effect for Cards
   =================================== */
document.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = (y - centerY) / 20;
        const rotateY = (centerX - x) / 20;

        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    });

    card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0)';
    });
});

/* ===================================
   Performance Optimization
   =================================== */
// Debounce function for scroll events
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Lazy load images
document.addEventListener('DOMContentLoaded', () => {
    const lazyImages = document.querySelectorAll('img[data-src]');

    const imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.classList.add('loaded');
                imageObserver.unobserve(img);
            }
        });
    });

    lazyImages.forEach(img => imageObserver.observe(img));
});
