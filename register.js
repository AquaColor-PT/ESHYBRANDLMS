// EshyBrand LMS - registration script

const SUPABASE_URL = 'https://pjytyuhpubzuxbftuyqz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_jgggDCLJA5EjSkhjnJ7hBQ_rr5nolsm';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const form = document.getElementById('registerForm');
const msg = document.getElementById('msg');
const btn = document.getElementById('submitBtn');

// The confirmation email link opens the login page, using this site's own folder
// (works on GitHub Pages: https://aquacolor-pt.github.io/ESHYBRANDLMS/login.html)
const LOGIN_URL = new URL('login.html', window.location.href).href;

function showMsg(text, type) {
  msg.textContent = text;
  msg.className = type;
}

// If already logged in, go to the login page, which sends learners on
// (it also asks for their ID number if they have not been verified yet)
sb.auth.getSession().then(({ data }) => {
  if (data.session) window.location.href = 'login.html';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const fullName = document.getElementById('fullName').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const confirm = document.getElementById('confirm').value;

  if (fullName.split(' ').length < 2) {
    return showMsg('Please enter your name and surname.', 'err');
  }
  if (password.length < 6) {
    return showMsg('Password must be at least 6 characters.', 'err');
  }
  if (password !== confirm) {
    return showMsg('Passwords do not match.', 'err');
  }

  btn.disabled = true;
  showMsg('Creating your profile...', '');

  // The full name is saved with the account; a database trigger copies it into the profiles table
  const { data, error } = await sb.auth.signUp({
    email: email,
    password: password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: LOGIN_URL
    }
  });

  if (error) {
    btn.disabled = false;
    return showMsg(error.message, 'err');
  }

  if (data.session) {
    // Email confirmation is turned off: the learner is logged in already.
    // Send them to the login page so they can verify their ID number.
    showMsg('Registration successful! Redirecting...', 'ok');
    setTimeout(() => (window.location.href = 'login.html'), 1200);
  } else {
    // Email confirmation is turned on: the learner must confirm first
    showMsg('Registration successful! Check your email to confirm your account, then log in and enter your ID number.', 'ok');
    form.reset();
    btn.disabled = false;
  }
});
