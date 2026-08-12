// ============================================================
// ClientFlow - ПОЛНЫЙ РАБОЧИЙ КОД
// ============================================================

const telegramApp = window.Telegram?.WebApp || null;

// ============================================================
// Telegram Mini App Setup
// ============================================================

if (telegramApp) {
    telegramApp.ready();
    telegramApp.expand();
    telegramApp.disableVerticalSwipes?.();

    function setViewportHeight() {
        const height = telegramApp.viewportStableHeight || telegramApp.viewportHeight || window.innerHeight;
        document.documentElement.style.setProperty('--tg-viewport-stable-height', `${height}px`);
        document.documentElement.style.setProperty('--app-height', `${height}px`);
    }
    
    setViewportHeight();
    telegramApp.onEvent('viewportChanged', setViewportHeight);
    window.addEventListener('resize', setViewportHeight);

    const telegramUser = telegramApp.initDataUnsafe?.user;

    if (telegramUser) {
        const userName = telegramUser.first_name || "Специалист";
        const greeting = document.querySelector(".greeting");
        if (greeting) greeting.textContent = `Добрый день, ${userName} 👋`;
        const avatar = document.querySelector(".avatar");
        if (avatar) avatar.textContent = userName.charAt(0).toUpperCase();
    }

    window.haptic = function (type = "light") {
        if (telegramApp.HapticFeedback?.impactOccurred) {
            telegramApp.HapticFeedback.impactOccurred(type);
        }
    };
} else {
    window.haptic = function () {};
}

// ============================================================
// Storage
// ============================================================

const CLIENTFLOW_STORAGE_KEY = "clientflow_data";

const clientFlowDefaultData = {
    clients: [
        { id: 1, name: "Анна", phone: "+375 29 000 00 00", visits: 8, total: 620, status: "Постоянный клиент", archived: false },
        { id: 2, name: "Мария", phone: "+375 33 111 11 11", visits: 1, total: 80, status: "Новый клиент", archived: false }
    ],
    appointments: [
        { id: 1, client: "Анна", time: "14:30", date: getTodayDate(), service: "Маникюр", price: 150, status: "Ожидает оплаты", archived: false },
        { id: 2, client: "Мария", time: "16:00", date: getTodayDate(), service: "Педикюр", price: 80, status: "Оплачено", archived: true }
    ],
    invoices: [
        { id: 1, client: "Анна", amount: 150, status: "Не оплачено", appointmentId: 1 }
    ]
};

function getTodayDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function formatDate(dateString) {
    if (!dateString) return "";
    const parts = dateString.split("-");
    if (parts.length !== 3) return dateString;
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function getMonthName(year, month) {
    return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(new Date(year, month, 1));
}

function generateId() {
    return Date.now() + Math.floor(Math.random() * 1000);
}

function clientFlowLoadData() {
    const saved = localStorage.getItem(CLIENTFLOW_STORAGE_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (!Array.isArray(parsed.clients)) parsed.clients = [];
            if (!Array.isArray(parsed.appointments)) parsed.appointments = [];
            if (!Array.isArray(parsed.invoices)) parsed.invoices = [];

            parsed.clients.forEach(client => { if (typeof client.archived === "undefined") client.archived = false; });
            parsed.appointments.forEach(appointment => {
                if (!appointment.date) appointment.date = getTodayDate();
                if (!appointment.status) appointment.status = "Ожидает оплаты";
                if (typeof appointment.archived === "undefined") appointment.archived = appointment.status === "Оплачено";
            });
            parsed.invoices.forEach(invoice => {
                if (!invoice.status) invoice.status = "Не оплачено";
                if (typeof invoice.appointmentId === "undefined" && invoice.id === 1) invoice.appointmentId = 1;
            });

            localStorage.setItem(CLIENTFLOW_STORAGE_KEY, JSON.stringify(parsed));
            return parsed;
        } catch (error) {
            console.error("ClientFlow storage error:", error);
        }
    }
    const initialData = JSON.parse(JSON.stringify(clientFlowDefaultData));
    localStorage.setItem(CLIENTFLOW_STORAGE_KEY, JSON.stringify(initialData));
    return initialData;
}

const clientFlowData = clientFlowLoadData();
window.clientFlowData = clientFlowData;

function clientFlowSaveData() {
    localStorage.setItem(CLIENTFLOW_STORAGE_KEY, JSON.stringify(clientFlowData));
}

window.saveClientFlowData = clientFlowSaveData;

const today = new Date();
let calendarYear = today.getFullYear();
let calendarMonth = today.getMonth();
let selectedDate = getTodayDate();

function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function findClient(id) { return clientFlowData.clients.find(c => Number(c.id) === Number(id)); }
function findAppointment(id) { return clientFlowData.appointments.find(a => Number(a.id) === Number(id)); }
function findInvoice(id) { return clientFlowData.invoices.find(i => Number(i.id) === Number(id)); }
function findInvoiceForAppointment(appointmentId) { return clientFlowData.invoices.find(i => Number(i.appointmentId) === Number(appointmentId)); }

function openScreen(screenName) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    const target = document.getElementById(`${screenName}-screen`);
    if (target) target.classList.add("active");

    document.querySelectorAll(".nav-btn").forEach(button => {
        button.classList.remove("active");
        if (button.dataset.screen === screenName) button.classList.add("active");
    });

    if (screenName === "dashboard") renderDashboard();
    else if (screenName === "clients") renderClients();
    else if (screenName === "appointments") { renderCalendar(); renderAppointments(); }
    else if (screenName === "invoices") renderInvoices();
}

document.querySelectorAll(".nav-btn").forEach(button => {
    button.addEventListener("click", () => { window.haptic("light"); openScreen(button.dataset.screen); });
});

document.querySelectorAll(".action-card").forEach(button => {
    button.addEventListener("click", () => { window.haptic("light"); openScreen(button.dataset.screen); });
});

function renderDashboard() {
    const todayCard = document.querySelector(".today-card");
    if (!todayCard) return;

    const appointments = clientFlowData.appointments || [];
    const todayAppointments = appointments.filter(a => a.date === getTodayDate());
    const appointmentCount = todayAppointments.length;
    const expectedIncome = todayAppointments.reduce((sum, a) => sum + Number(a.price || 0), 0);
    const actualIncome = todayAppointments.filter(a => a.status === "Оплачено").reduce((sum, a) => sum + Number(a.price || 0), 0);

    const stats = todayCard.querySelectorAll(".stat strong");
    if (stats[0]) stats[0].textContent = appointmentCount;
    if (stats[1]) stats[1].textContent = `${expectedIncome} €`;
    if (stats[2]) stats[2].textContent = `${actualIncome} €`;

    const nextCard = document.querySelector(".next-card");
    if (!nextCard) return;

    const activeToday = todayAppointments.filter(a => a.archived !== true && a.status !== "Оплачено").sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
    const nextAppointment = activeToday.length > 0 ? activeToday[0] : null;

    if (!nextAppointment) {
        nextCard.innerHTML = `<p class="label">Сегодня</p><div class="empty-dashboard">Нет предстоящих записей</div>`;
        return;
    }

    nextCard.innerHTML = `
        <p class="label">Следующая запись</p>
        <div class="appointment">
            <div>
                <h2>${escapeHtml(nextAppointment.time || "")}</h2>
                <p>${escapeHtml(nextAppointment.client || "")}</p>
            </div>
            <div class="service">
                ${escapeHtml(nextAppointment.service || "")}<br>
                <strong>${Number(nextAppointment.price || 0)} €</strong>
            </div>
        </div>
        <button class="primary-btn" type="button" data-dashboard-open="appointments">Открыть записи</button>
    `;

    nextCard.querySelector("[data-dashboard-open]")?.addEventListener("click", () => openScreen("appointments"));
}

function renderClients() {
    const container = document.querySelector("#clients-screen .list");
    if (!container) return;
    container.innerHTML = "";

    const activeClients = clientFlowData.clients.filter(c => !c.archived);
    const archivedClients = clientFlowData.clients.filter(c => c.archived);

    if (activeClients.length === 0) {
        container.innerHTML = `<div class="empty-state">Клиентов пока нет</div>`;
    } else {
        activeClients.forEach(client => container.appendChild(createClientCard(client, false)));
    }

    if (archivedClients.length > 0) {
        const title = document.createElement("h3");
        title.className = "section-subtitle";
        title.textContent = "Архив";
        container.appendChild(title);
        archivedClients.forEach(client => container.appendChild(createClientCard(client, true)));
    }
}

function createClientCard(client, archived) {
    const card = document.createElement("div");
    card.className = "client-card";
    if (archived) card.classList.add("archived-card");

    card.innerHTML = `
        <div class="card-main">
            <h3>${escapeHtml(client.name)}</h3>
            <p>📞 ${escapeHtml(client.phone || "")}</p>
            <span class="client-status">${escapeHtml(client.status || "")}</span>
            <div class="card-actions">
                <button class="small-btn edit-btn" type="button" data-action="edit-client" data-id="${client.id}">Редактировать</button>
                ${archived ? `
                    <button class="small-btn restore-btn" type="button" data-action="restore-client" data-id="${client.id}">Вернуть</button>
                ` : `
                    <button class="small-btn archive-btn" type="button" data-action="archive-client" data-id="${client.id}">В архив</button>
                `}
                <button class="small-btn danger-btn" type="button" data-action="delete-client" data-id="${client.id}">Удалить</button>
            </div>
        </div>
    `;
    return card;
}

function renderCalendar() {
    const calendar = document.getElementById("appointments-calendar");
    if (!calendar) return;
    const title = document.getElementById("calendar-month-title");
    if (title) title.textContent = getMonthName(calendarYear, calendarMonth);

    const grid = document.getElementById("calendar-grid");
    if (!grid) return;
    grid.innerHTML = "";

    const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
    weekdays.forEach(day => {
        const header = document.createElement("div");
        header.className = "calendar-weekday";
        header.textContent = day;
        grid.appendChild(header);
    });

    const firstDay = new Date(calendarYear, calendarMonth, 1);
    let startDay = firstDay.getDay();
    startDay = startDay === 0 ? 6 : startDay - 1;
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const appointments = clientFlowData.appointments || [];

    for (let i = 0; i < startDay; i++) {
        const empty = document.createElement("div");
        empty.className = "calendar-day empty";
        grid.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateString = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const dayButton = document.createElement("button");
        dayButton.type = "button";
        dayButton.className = "calendar-day";
        if (dateString === getTodayDate()) dayButton.classList.add("today");
        if (dateString === selectedDate) dayButton.classList.add("selected");

        const dayAppointments = appointments.filter(a => a.date === dateString);
        const unpaidCount = dayAppointments.filter(a => a.status !== "Оплачено").length;

        dayButton.innerHTML = `
            <span class="calendar-day-number">${day}</span>
            ${dayAppointments.length > 0 ? `<span class="calendar-dots">${dayAppointments.slice(0, 3).map(() => "<i></i>").join("")}</span>` : ""}
            ${unpaidCount > 0 ? `<span class="calendar-count">${unpaidCount}</span>` : ""}
        `;

        dayButton.addEventListener("click", () => {
            selectedDate = dateString;
            window.haptic("light");
            renderCalendar();
            renderAppointments();
        });
        grid.appendChild(dayButton);
    }
}

function changeCalendarMonth(direction) {
    calendarMonth += direction;
    if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
    if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
    selectedDate = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-01`;
    renderCalendar();
    renderAppointments();
}

function renderAppointments() {
    const container = document.querySelector("#appointments-screen .list");
    if (!container) return;
    container.innerHTML = "";

    const appointments = (clientFlowData.appointments || []).filter(a => a.date === selectedDate).sort((a, b) => {
        const aPaid = a.status === "Оплачено";
        const bPaid = b.status === "Оплачено";
        if (aPaid !== bPaid) return aPaid ? 1 : -1;
        return String(a.time || "").localeCompare(String(b.time || ""));
    });

    const selectedTitle = document.getElementById("selected-date-title");
    if (selectedTitle) selectedTitle.textContent = selectedDate === getTodayDate() ? "Сегодня" : formatDate(selectedDate);

    if (appointments.length === 0) {
        container.innerHTML = `<div class="empty-state">На этот день записей нет</div>`;
        return;
    }

    appointments.forEach(item => {
        const card = document.createElement("div");
        card.className = "appointment-card";
        const paid = item.status === "Оплачено";
        if (paid) card.classList.add("appointment-completed");

        const invoice = findInvoiceForAppointment(item.id);
        card.innerHTML = `
            <div class="appointment-time">${escapeHtml(item.time || "--:--")}</div>
            <div class="appointment-info">
                <h3>${escapeHtml(item.client || "")}</h3>
                <p>${escapeHtml(item.service || "")} · ${Number(item.price || 0)} €</p>
                <span class="appointment-status ${paid ? "appointment-paid" : ""}">${paid ? "Оплачено" : "Ожидает оплаты"}</span>
                <div class="card-actions">
                    <button class="small-btn ${paid ? "invoice-status-btn" : "pay-btn"}" type="button" data-action="pay-appointment" data-id="${item.id}">${paid ? "Отменить оплату" : "Оплата"}</button>
                    <button class="small-btn edit-btn" type="button" data-action="edit-appointment" data-id="${item.id}">Редактировать</button>
                    ${invoice ? `<span class="invoice-link-note">Счёт #${invoice.id}</span>` : ""}
                    <button class="small-btn danger-btn" type="button" data-action="delete-appointment" data-id="${item.id}">Удалить</button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function payAppointment(id) {
    const appointment = findAppointment(id);
    if (!appointment) return;

    if (appointment.status === "Оплачено") {
        const invoice = findInvoiceForAppointment(appointment.id);
        if (invoice) invoice.status = "Не оплачено";
        appointment.status = "Ожидает оплаты";
        appointment.archived = false;
        clientFlowSaveData();
        renderAppointments();
        renderInvoices();
        renderDashboard();
        window.haptic("light");
        return;
    }

    let invoice = findInvoiceForAppointment(appointment.id);
    if (!invoice) {
        invoice = { id: generateId(), client: appointment.client, amount: Number(appointment.price || 0), status: "Оплачено", appointmentId: appointment.id, date: appointment.date };
        clientFlowData.invoices.push(invoice);
    } else {
        invoice.client = appointment.client;
        invoice.amount = Number(appointment.price || 0);
        invoice.status = "Оплачено";
        invoice.date = appointment.date;
    }

    appointment.status = "Оплачено";
    appointment.archived = true;
    clientFlowSaveData();
    renderAppointments();
    renderInvoices();
    renderDashboard();
    window.haptic("light");
}

function renderInvoices() {
    const container = document.querySelector("#invoices-screen .list");
    if (!container) return;
    container.innerHTML = "";

    const invoices = (clientFlowData.invoices || []).slice().sort((a, b) => {
        const aPaid = a.status === "Оплачено";
        const bPaid = b.status === "Оплачено";
        if (aPaid !== bPaid) return aPaid ? 1 : -1;
        return Number(b.id) - Number(a.id);
    });

    if (invoices.length === 0) {
        container.innerHTML = `<div class="empty-state">Счетов пока нет</div>`;
        return;
    }

    invoices.forEach(invoice => {
        const card = document.createElement("div");
        card.className = "invoice-card";
        const paid = invoice.status === "Оплачено";
        if (paid) card.classList.add("invoice-completed");

        card.innerHTML = `
            <div class="invoice-main">
                <div class="invoice-top">
                    <div>
                        <h3>Счёт #${invoice.id}</h3>
                        <p>${escapeHtml(invoice.client || "")}</p>
                    </div>
                    <strong>${Number(invoice.amount || 0)} €</strong>
                </div>
                <span class="invoice-status ${paid ? "paid" : "unpaid"}">${paid ? "Оплачено" : "Не оплачено"}</span>
                ${invoice.date ? `<div class="invoice-date">${formatDate(invoice.date)}</div>` : ""}
                <div class="card-actions">
                    <button class="small-btn edit-btn" type="button" data-action="edit-invoice" data-id="${invoice.id}">Редактировать</button>
                    <button class="small-btn invoice-status-btn" type="button" data-action="toggle-invoice" data-id="${invoice.id}">${paid ? "Отменить оплату" : "Оплатить"}</button>
                    <button class="small-btn danger-btn" type="button" data-action="delete-invoice" data-id="${invoice.id}">Удалить</button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function createModal() {
    if (document.getElementById("clientflow-modal")) return;
    const modal = document.createElement("div");
    modal.id = "clientflow-modal";
    modal.innerHTML = `
        <div class="modal-overlay">
            <div class="modal-box">
                <button class="modal-close" type="button" aria-label="Закрыть">×</button>
                <div id="modal-content"></div>
            </div>
        </div>
    `;
    const appContainer = document.querySelector(".app");
    if (appContainer) appContainer.appendChild(modal);
    else document.body.appendChild(modal);

    modal.querySelector(".modal-close").addEventListener("click", closeModal);
    modal.querySelector(".modal-overlay").addEventListener("click", e => { if (e.target === modal.querySelector(".modal-overlay")) closeModal(); });
}

function openModal(content) {
    const modal = document.getElementById("clientflow-modal");
    if (!modal) return;
    const contentBox = modal.querySelector("#modal-content");
    if (!contentBox) return;
    contentBox.innerHTML = content;
    modal.classList.add("show");
    setTimeout(() => { const firstInput = contentBox.querySelector("input"); if (firstInput) firstInput.focus(); }, 100);
}

function closeModal() {
    const modal = document.getElementById("clientflow-modal");
    if (!modal) return;
    modal.classList.remove("show");
}

function openClientForm() {
    openModal(`
        <h2>Новый клиент</h2>
        <input id="client-name" type="text" placeholder="Имя">
        <input id="client-phone" type="tel" placeholder="Телефон">
        <button class="primary-btn" id="save-client" type="button">Сохранить</button>
    `);
    document.getElementById("save-client").addEventListener("click", function() {
        const name = document.getElementById("client-name").value.trim();
        const phone = document.getElementById("client-phone").value.trim();
        if (!name) { document.getElementById("client-name").focus(); return; }
        clientFlowData.clients.push({ id: generateId(), name, phone, visits: 0, total: 0, status: "Новый клиент", archived: false });
        clientFlowSaveData();
        renderClients();
        renderDashboard();
        closeModal();
    });
}

function openAppointmentForm() {
    openModal(`
        <h2>Новая запись</h2>
        <input id="appointment-client" type="text" placeholder="Клиент">
        <input id="appointment-service" type="text" placeholder="Услуга">
        <input id="appointment-date" type="date" value="${selectedDate}">
        <input id="appointment-time" type="time">
        <input id="appointment-price" type="number" min="0" placeholder="Цена">
        <button class="primary-btn" id="save-appointment" type="button">Создать запись</button>
    `);
    document.getElementById("save-appointment").addEventListener("click", function() {
        const client = document.getElementById("appointment-client").value.trim();
        if (!client) { document.getElementById("appointment-client").focus(); return; }
        const service = document.getElementById("appointment-service").value.trim();
        const date = document.getElementById("appointment-date").value || getTodayDate();
        const time = document.getElementById("appointment-time").value;
        const price = Number(document.getElementById("appointment-price").value) || 0;
        clientFlowData.appointments.push({ id: generateId(), client, service, date, time, price, status: "Ожидает оплаты", archived: false });
        selectedDate = date;
        const createdDate = new Date(`${date}T12:00:00`);
        calendarYear = createdDate.getFullYear();
        calendarMonth = createdDate.getMonth();
        clientFlowSaveData();
        renderCalendar();
        renderAppointments();
        renderDashboard();
        closeModal();
    });
}

function openInvoiceForm() {
    openModal(`
        <h2>Новый счёт</h2>
        <input id="invoice-client" type="text" placeholder="Клиент">
        <input id="invoice-amount" type="number" min="0" placeholder="Сумма">
        <button class="primary-btn" id="save-invoice" type="button">Создать счёт</button>
    `);
    document.getElementById("save-invoice").addEventListener("click", function() {
        const client = document.getElementById("invoice-client").value.trim();
        const amount = Number(document.getElementById("invoice-amount").value) || 0;
        if (!client) { document.getElementById("invoice-client").focus(); return; }
        if (amount <= 0) { document.getElementById("invoice-amount").focus(); return; }
        clientFlowData.invoices.push({ id: generateId(), client, amount, status: "Не оплачено", date: getTodayDate() });
        clientFlowSaveData();
        renderInvoices();
        renderDashboard();
        closeModal();
    });
}

function openClientEditForm(id) {
    const client = findClient(id);
    if (!client) return;
    openModal(`
        <h2>Редактировать клиента</h2>
        <input id="edit-client-name" type="text" value="${escapeHtml(client.name)}" placeholder="Имя">
        <input id="edit-client-phone" type="tel" value="${escapeHtml(client.phone || "")}" placeholder="Телефон">
        <button class="primary-btn" id="update-client" type="button">Сохранить изменения</button>
    `);
    document.getElementById("update-client").addEventListener("click", function() {
        const name = document.getElementById("edit-client-name").value.trim();
        const phone = document.getElementById("edit-client-phone").value.trim();
        if (!name) return;
        client.name = name;
        client.phone = phone;
        clientFlowSaveData();
        renderClients();
        renderDashboard();
        closeModal();
    });
}

function archiveClient(id) {
    const client = findClient(id);
    if (!client) return;
    client.archived = true;
    clientFlowSaveData();
    renderClients();
    renderDashboard();
}

function restoreClient(id) {
    const client = findClient(id);
    if (!client) return;
    client.archived = false;
    clientFlowSaveData();
    renderClients();
    renderDashboard();
}

function deleteClient(id) {
    clientFlowData.clients = clientFlowData.clients.filter(c => Number(c.id) !== Number(id));
    clientFlowSaveData();
    renderClients();
    renderDashboard();
}

function openAppointmentEditForm(id) {
    const appointment = findAppointment(id);
    if (!appointment) return;
    openModal(`
        <h2>Редактировать запись</h2>
        <input id="edit-appointment-client" type="text" value="${escapeHtml(appointment.client || "")}" placeholder="Клиент">
        <input id="edit-appointment-service" type="text" value="${escapeHtml(appointment.service || "")}" placeholder="Услуга">
        <input id="edit-appointment-date" type="date" value="${escapeHtml(appointment.date || getTodayDate())}">
        <input id="edit-appointment-time" type="time" value="${escapeHtml(appointment.time || "")}">
        <input id="edit-appointment-price" type="number" min="0" value="${Number(appointment.price) || 0}" placeholder="Цена">
        <button class="primary-btn" id="update-appointment" type="button">Сохранить изменения</button>
    `);
    document.getElementById("update-appointment").addEventListener("click", function() {
        const client = document.getElementById("edit-appointment-client").value.trim();
        if (!client) return;
        const oldDate = appointment.date;
        appointment.client = client;
        appointment.service = document.getElementById("edit-appointment-service").value.trim();
        appointment.date = document.getElementById("edit-appointment-date").value || getTodayDate();
        appointment.time = document.getElementById("edit-appointment-time").value;
        appointment.price = Number(document.getElementById("edit-appointment-price").value) || 0;
        const invoice = findInvoiceForAppointment(appointment.id);
        if (invoice) { invoice.client = appointment.client; invoice.amount = appointment.price; invoice.date = appointment.date; }
        if (oldDate !== appointment.date) {
            selectedDate = appointment.date;
            const newDate = new Date(`${appointment.date}T12:00:00`);
            calendarYear = newDate.getFullYear();
            calendarMonth = newDate.getMonth();
        }
        clientFlowSaveData();
        renderCalendar();
        renderAppointments();
        renderInvoices();
        renderDashboard();
        closeModal();
    });
}

function deleteAppointment(id) {
    clientFlowData.appointments = clientFlowData.appointments.filter(a => Number(a.id) !== Number(id));
    clientFlowData.invoices = clientFlowData.invoices.filter(i => Number(i.appointmentId) !== Number(id));
    clientFlowSaveData();
    renderCalendar();
    renderAppointments();
    renderInvoices();
    renderDashboard();
}

function openInvoiceEditForm(id) {
    const invoice = findInvoice(id);
    if (!invoice) return;
    openModal(`
        <h2>Редактировать счёт</h2>
        <input id="edit-invoice-client" type="text" value="${escapeHtml(invoice.client || "")}" placeholder="Клиент">
        <input id="edit-invoice-amount" type="number" min="0" value="${Number(invoice.amount) || 0}" placeholder="Сумма">
        <button class="primary-btn" id="update-invoice" type="button">Сохранить изменения</button>
    `);
    document.getElementById("update-invoice").addEventListener("click", function() {
        const client = document.getElementById("edit-invoice-client").value.trim();
        const amount = Number(document.getElementById("edit-invoice-amount").value) || 0;
        if (!client) return;
        if (amount <= 0) return;
        invoice.client = client;
        invoice.amount = amount;
        if (invoice.appointmentId) {
            const appointment = findAppointment(invoice.appointmentId);
            if (appointment) { appointment.client = client; appointment.price = amount; }
        }
        clientFlowSaveData();
        renderInvoices();
        renderAppointments();
        renderDashboard();
        closeModal();
    });
}

function toggleInvoice(id) {
    const invoice = findInvoice(id);
    if (!invoice) return;
    const appointment = invoice.appointmentId ? findAppointment(invoice.appointmentId) : null;
    if (invoice.status === "Оплачено") {
        invoice.status = "Не оплачено";
        if (appointment) { appointment.status = "Ожидает оплаты"; appointment.archived = false; }
    } else {
        invoice.status = "Оплачено";
        if (appointment) { appointment.status = "Оплачено"; appointment.archived = true; }
    }
    clientFlowSaveData();
    renderInvoices();
    renderAppointments();
    renderDashboard();
    window.haptic("light");
}

function deleteInvoice(id) {
    const invoice = findInvoice(id);
    if (!invoice) return;
    const appointment = invoice.appointmentId ? findAppointment(invoice.appointmentId) : null;
    if (appointment) { appointment.status = "Ожидает оплаты"; appointment.archived = false; }
    clientFlowData.invoices = clientFlowData.invoices.filter(i => Number(i.id) !== Number(id));
    clientFlowSaveData();
    renderInvoices();
    renderAppointments();
    renderDashboard();
}

function confirmDelete(title, message, callback) {
    openModal(`
        <div class="confirm-modal">
            <h2>${escapeHtml(title)}</h2>
            <p>${escapeHtml(message)}</p>
            <div class="confirm-actions">
                <button class="secondary-btn" id="cancel-confirm" type="button">Отмена</button>
                <button class="danger-action-btn" id="confirm-action" type="button">Удалить</button>
            </div>
        </div>
    `);
    document.getElementById("cancel-confirm").addEventListener("click", closeModal);
    document.getElementById("confirm-action").addEventListener("click", function() { callback(); closeModal(); });
}

document.addEventListener("click", function(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    const id = button.dataset.id;

    if (action === "edit-client") openClientEditForm(id);
    if (action === "archive-client") archiveClient(id);
    if (action === "restore-client") restoreClient(id);
    if (action === "delete-client") confirmDelete("Удалить клиента?", "Клиент будет удалён окончательно.", () => deleteClient(id));
    if (action === "edit-appointment") openAppointmentEditForm(id);
    if (action === "pay-appointment") payAppointment(id);
    if (action === "delete-appointment") confirmDelete("Удалить запись?", "Запись и связанный автоматический счёт будут удалены.", () => deleteAppointment(id));
    if (action === "edit-invoice") openInvoiceEditForm(id);
    if (action === "toggle-invoice") toggleInvoice(id);
    if (action === "delete-invoice") confirmDelete("Удалить счёт?", "Счёт будет удалён окончательно.", () => deleteInvoice(id));
});

document.getElementById("calendar-prev")?.addEventListener("click", () => changeCalendarMonth(-1));
document.getElementById("calendar-next")?.addEventListener("click", () => changeCalendarMonth(1));
document.getElementById("calendar-today")?.addEventListener("click", function() {
    const current = new Date();
    calendarYear = current.getFullYear();
    calendarMonth = current.getMonth();
    selectedDate = getTodayDate();
    renderCalendar();
    renderAppointments();
});

document.querySelectorAll(".add-btn").forEach(button => {
    button.addEventListener("click", function() {
        const type = button.dataset.add;
        if (type === "client") openClientForm();
        if (type === "appointment") openAppointmentForm();
        if (type === "invoice") openInvoiceForm();
    });
});

createModal();
renderDashboard();