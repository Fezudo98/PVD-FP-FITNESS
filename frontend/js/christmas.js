document.addEventListener('DOMContentLoaded', () => {
    const snowContainer = document.createElement('div');
    snowContainer.id = 'snow-container';
    document.body.appendChild(snowContainer);

    const createSnowflake = () => {
        const snowflake = document.createElement('div');
        snowflake.classList.add('snowflake');
        snowflake.textContent = '❄';

        // Randomize position and animation
        snowflake.style.left = Math.random() * 100 + 'vw';
        snowflake.style.animationDuration = Math.random() * 3 + 2 + 's'; // 2-5 seconds
        snowflake.style.opacity = Math.random();
        snowflake.style.fontSize = Math.random() * 10 + 10 + 'px';

        snowContainer.appendChild(snowflake);

        // Remove after animation
        setTimeout(() => {
            snowflake.remove();
        }, 5000);
    };

    // Create a snowflake every 100ms
    setInterval(createSnowflake, 100);

    // Check for couple avatar visibility
    const userDataString = localStorage.getItem('userData');
    if (userDataString) {
        try {
            const userData = JSON.parse(userDataString);
            const userName = userData.nome ? userData.nome.trim() : '';
            // Users allowed to see the couple avatar
            const allowedUsers = ['Fernando Sérgio', 'Bruna Silva'];

            if (allowedUsers.includes(userName)) {
                const coupleContainer = document.getElementById('couple-container');
                if (coupleContainer) {
                    coupleContainer.classList.remove('d-none');
                }
            }
        } catch (e) {
            console.error("Error parsing userData for Christmas avatar:", e);
        }
    }
});
