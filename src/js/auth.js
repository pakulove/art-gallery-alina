
// Add event listeners when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll(".toggle-form").forEach((link) => {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      toggleForms();
    });
  });
});

function toggleForms() {
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");

  if (loginForm.style.display === "none") {
    loginForm.style.display = "block";
    registerForm.style.display = "none";
  } else {
    loginForm.style.display = "none";
    registerForm.style.display = "block";
  }
}

function onRegisterSuccess(event) {
  if (
    event.detail.xhr &&
    event.detail.xhr.responseText.includes("Регистрация успешна")
  ) {
    toggleForms();
    document.getElementById("register-first-name").value = "";
    document.getElementById("register-last-name").value = "";
    document.getElementById("register-email").value = "";
    document.getElementById("register-password").value = "";
    document.getElementById("register-phone").value = "";
    document.getElementById("auth-message").className = "success";
  }
}

function onLoginSuccess(event) {
  alert("Login response: " + event.detail.xhr.responseText);

  if (
    event.detail.xhr &&
    event.detail.xhr.responseText.includes("Вход выполнен успешно")
  ) {
    const messageDiv = document.getElementById("auth-message");
    messageDiv.innerHTML = event.detail.xhr.responseText;
    messageDiv.className = "success";

    setTimeout(() => {
      window.location.href = "/";
    }, 1000);
  } else {
    const messageDiv = document.getElementById("auth-message");
    messageDiv.innerHTML = event.detail.xhr.responseText;
    messageDiv.className = "error";
  }
}
